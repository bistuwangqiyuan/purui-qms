/**
 * 检验业务路由：报检单（IQC/IPQC/OQC）、检验录入、审核处置、巡检计划、附件
 */
import type {
  Batch,
  BatchStatus,
  InspectionItemResult,
  InspectionKind,
  InspectionStandard,
  Material,
  Ncr,
  Partner,
  PatrolPlan,
  ProcessInspType,
} from '../../../shared/types';
import { toSummary } from '../../../shared/types';
import { getSamplingPlan, getSamplingPlanByConfig } from '../../../shared/sampling';
import { COMPONENT_TYPES, getComponentType } from '../../../shared/masterdata';
import type { AuthInfo, Route } from '../lib';
import {
  batchStore,
  deleteEntity,
  fail,
  fileStore,
  getEntity,
  json,
  listByPrefix,
  notify,
  putEntity,
} from '../lib';

export async function listBatches(): Promise<Batch[]> {
  const bs = batchStore();
  const { blobs } = await bs.list({ prefix: 'batch-' });
  const items = await Promise.all(blobs.map((b) => bs.get(b.key, { type: 'json' }) as Promise<Batch>));
  return items.filter(Boolean).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getBatch(id: string): Promise<Batch | null> {
  return (await batchStore().get(`batch-${id}`, { type: 'json' })) as Batch | null;
}

export async function saveBatch(b: Batch): Promise<void> {
  await batchStore().setJSON(`batch-${b.id}`, b);
}

function nextBatchNo(existing: Batch[], kind: InspectionKind, code: string): string {
  const today = new Date();
  const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const prefix = `${kind}-${code}-${ymd}`;
  const count = existing.filter((b) => b.batchNo.startsWith(prefix)).length;
  return `${prefix}-${String(count + 1).padStart(3, '0')}`;
}

/** 供应商用户只能看到自己的批次 */
function visibleTo(auth: AuthInfo, b: Batch): boolean {
  if (auth.userType === 'internal') return true;
  if (auth.userType === 'supplier') return b.supplierId === auth.partnerId;
  if (auth.userType === 'customer') return b.customerId === auth.partnerId;
  return false;
}

/**
 * 跳检规则判定（GB/T 2828.1 转移规则思想的企业简化实现）：
 * 连续 consecutivePass 批检验接收后，每 skipOneOf 批中跳检 skipOneOf-1 批。
 */
async function shouldSkip(std: InspectionStandard, materialKey: string, supplierKey: string): Promise<boolean> {
  const rule = std.skipRule;
  if (!rule?.enabled) return false;
  const all = await listBatches();
  const related = all.filter(
    (b) =>
      (b.materialId ?? b.componentTypeId) === materialKey &&
      (b.supplierId ?? b.supplier) === supplierKey,
  );
  // 自最近一次实际检验起的跳检连续数
  let skippedStreak = 0;
  for (const b of related) {
    if (b.skipNote && b.status === 'accepted') skippedStreak += 1;
    else break;
  }
  if (skippedStreak >= rule.skipOneOf - 1) return false; // 该批须实际检验
  // 实际检验的连续接收数（忽略跳检批）
  let passStreak = 0;
  for (const b of related) {
    if (b.skipNote) continue;
    if (!b.inspection) break;
    if (b.inspection.lotPass && (b.status === 'accepted' || b.status === 'concession')) passStreak += 1;
    else break;
  }
  return passStreak >= rule.consecutivePass;
}

/** 拒收批自动登记不合格品 */
export async function autoRegisterNcr(b: Batch, byId: string, byName: string): Promise<Ncr> {
  const existing = await listByPrefix<Ncr>('ncr-');
  const failedItems = (b.inspection?.items ?? []).filter((i) => !i.pass);
  const ncr: Ncr = {
    id: crypto.randomUUID(),
    no: `NCR-${new Date().getFullYear()}-${String(existing.length + 1).padStart(4, '0')}`,
    source: b.kind ?? 'IQC',
    batchId: b.id,
    batchNo: b.batchNo,
    materialName: b.componentTypeName,
    supplier: b.supplier,
    supplierId: b.supplierId,
    qty: b.inspection?.defectiveCount ?? 0,
    defectDesc:
      failedItems.map((i) => `${i.name}（不合格 ${i.defects} 件）`).join('；') || '批检验拒收',
    severity: 'Ma',
    status: 'open',
    shareWithSupplier: true,
    history: [
      { at: new Date().toISOString(), by: byId, byName, action: `由报检单 ${b.batchNo} 拒收自动登记` },
    ],
    createdAt: new Date().toISOString(),
    demo: b.demo,
  };
  await putEntity('ncr-', ncr.id, ncr);
  return ncr;
}

export const inspectionRoutes: Route[] = [
  // ---------- 报检单列表 / 详情 ----------
  {
    method: 'GET',
    pattern: /^\/batches$/,
    internalOnly: false,
    handler: async ({ url, auth }) => {
      const all = (await listBatches()).filter((b) => visibleTo(auth, b));
      const status = url.searchParams.get('status');
      const kind = url.searchParams.get('kind');
      let filtered = status ? all.filter((b) => b.status === status) : all;
      if (kind) filtered = filtered.filter((b) => (b.kind ?? 'IQC') === kind);
      return json(filtered.map(toSummary));
    },
  },
  {
    method: 'GET',
    pattern: /^\/batches\/([0-9a-f-]+)$/,
    internalOnly: false,
    handler: async ({ match, auth }) => {
      const b = await getBatch(match[1]);
      if (!b || !visibleTo(auth, b)) return fail(404, '批次不存在');
      return json(b);
    },
  },

  // ---------- 报检单创建（IQC/IPQC/OQC） ----------
  {
    method: 'POST',
    pattern: /^\/batches$/,
    roles: ['inspector', 'admin'],
    handler: async ({ req, auth }) => {
      const body = (await req.json()) as {
        kind?: InspectionKind;
        componentTypeId?: string;
        materialId?: string;
        supplier?: string;
        supplierId?: string;
        supplierLotNo?: string;
        quantity: number;
        arrivalDate: string;
        poNo?: string;
        project?: string;
        customerId?: string;
        shipmentNo?: string;
        line?: string;
        process?: string;
        processInspType?: ProcessInspType;
      };
      const kind: InspectionKind = body.kind ?? 'IQC';
      const qty = Math.floor(Number(body.quantity));
      if (!Number.isFinite(qty) || qty < 2 || qty > 500000) {
        return fail(400, '批量数量须为 2–500000 的整数');
      }
      if (!body.arrivalDate) return fail(400, '请填写日期');

      let name = '';
      let code = '';
      let componentTypeId = '';
      let materialId: string | undefined;
      let materialCode: string | undefined;
      let standardId: string | undefined;
      let std: InspectionStandard | null = null;

      if (body.materialId) {
        const mat = await getEntity<Material>('material-', body.materialId);
        if (!mat) return fail(400, '物料不存在');
        if (!mat.standardId) return fail(400, `物料 ${mat.name} 未绑定检验标准，请先在基础数据中配置`);
        std = await getEntity<InspectionStandard>('standard-', mat.standardId);
        if (!std || !std.active) return fail(400, '物料绑定的检验标准不存在或已停用');
        name = mat.name;
        code = mat.code;
        materialId = mat.id;
        materialCode = mat.code;
        standardId = std.id;
        componentTypeId = mat.id;
      } else if (body.componentTypeId) {
        // 兼容旧版：按预置组部件类型
        const ct = getComponentType(body.componentTypeId);
        if (!ct) return fail(400, '组部件类型不存在');
        name = ct.name;
        code = ct.code;
        componentTypeId = ct.id;
      } else {
        return fail(400, '请选择物料或组部件类型');
      }

      let supplierId = body.supplierId;
      let supplierName = body.supplier?.trim() ?? '';
      if (supplierId) {
        const sp = await getEntity<Partner>('partner-', supplierId);
        if (!sp || sp.partnerKind !== 'supplier') return fail(400, '供应商不存在');
        supplierName = sp.name;
      }
      if (kind === 'IQC' && !supplierName) return fail(400, '来料检验须填写供应商');

      let customerId: string | undefined;
      let customerName: string | undefined;
      if (kind === 'OQC') {
        if (!body.customerId) return fail(400, '出货检验须选择客户');
        const cu = await getEntity<Partner>('partner-', body.customerId);
        if (!cu || cu.partnerKind !== 'customer') return fail(400, '客户不存在');
        customerId = cu.id;
        customerName = cu.name;
      }
      if (kind === 'IPQC' && !body.line?.trim()) return fail(400, '过程检验须填写产线');

      const all = await listBatches();
      const now = new Date().toISOString();
      const sampling = std
        ? getSamplingPlanByConfig(qty, std.sampling)
        : getSamplingPlan(qty, getComponentType(componentTypeId)!.aql);

      const batch: Batch = {
        id: crypto.randomUUID(),
        batchNo: nextBatchNo(all, kind, code),
        kind,
        componentTypeId,
        componentTypeName: name,
        materialId,
        materialCode,
        standardId,
        supplier: supplierName || '—',
        supplierId,
        supplierLotNo: body.supplierLotNo?.trim(),
        quantity: qty,
        arrivalDate: body.arrivalDate,
        poNo: body.poNo?.trim(),
        project: body.project?.trim(),
        customerId,
        customerName,
        shipmentNo: body.shipmentNo?.trim(),
        line: body.line?.trim(),
        process: body.process?.trim(),
        processInspType: body.processInspType,
        status: 'pending_inspection',
        sampling,
        history: [{ at: now, by: auth.userId, byName: auth.name, action: `${kind} 报检登记` }],
        createdBy: auth.userId,
        createdByName: auth.name,
        createdAt: now,
      };

      // 跳检规则
      if (std && kind === 'IQC') {
        const skip = await shouldSkip(std, materialId!, supplierId ?? supplierName);
        if (skip) {
          batch.status = 'accepted';
          batch.skipNote = `触发跳检规则（连续 ${std.skipRule!.consecutivePass} 批接收，每 ${std.skipRule!.skipOneOf} 批检 1 批），本批免检放行`;
          batch.history.push({ at: now, by: 'system', byName: '系统', action: batch.skipNote });
        }
      }

      await saveBatch(batch);
      return json(batch, 201);
    },
  },

  // ---------- 检验录入 ----------
  {
    method: 'POST',
    pattern: /^\/batches\/([0-9a-f-]+)\/inspection$/,
    roles: ['inspector', 'admin'],
    handler: async ({ req, match, auth }) => {
      const b = await getBatch(match[1]);
      if (!b) return fail(404, '批次不存在');
      if (b.status !== 'pending_inspection') return fail(409, '该批次当前不可录入检验结果');

      const body = (await req.json()) as {
        items: InspectionItemResult[];
        defectiveCount: number;
        attachmentIds?: string[];
        note?: string;
      };
      const defectiveCount = Math.floor(Number(body.defectiveCount));
      if (!Number.isFinite(defectiveCount) || defectiveCount < 0 || defectiveCount > b.sampling.sampleSize) {
        return fail(400, `不合格品数须在 0–${b.sampling.sampleSize} 之间`);
      }
      if (!Array.isArray(body.items) || body.items.length === 0) return fail(400, '缺少检验项目结果');

      const lotPass = defectiveCount <= b.sampling.ac;
      const now = new Date().toISOString();
      b.inspection = {
        inspectorId: auth.userId,
        inspectorName: auth.name,
        inspectedAt: now,
        items: body.items,
        defectiveCount,
        lotPass,
        attachmentIds: body.attachmentIds ?? [],
        note: body.note,
      };
      b.status = 'pending_review';
      b.history.push({
        at: now,
        by: auth.userId,
        byName: auth.name,
        action: `检验完成：不合格品数 ${defectiveCount}（Ac=${b.sampling.ac}/Re=${b.sampling.re}），初判${lotPass ? '接收' : '拒收'}`,
        note: body.note,
      });

      // 预警通知：计量值超预警值 / 超公差（方案 4.3.5）
      const std = b.standardId ? await getEntity<InspectionStandard>('standard-', b.standardId) : null;
      const warnings: string[] = [];
      for (const item of body.items) {
        if (item.kind !== 'quantitative' || !item.values?.length) continue;
        const stdItem = std?.items.find((si) => si.id === item.templateId);
        for (const v of item.values) {
          const overTol =
            (item.min !== undefined && v < item.min) || (item.max !== undefined && v > item.max);
          const overWarn =
            !overTol &&
            stdItem &&
            ((stdItem.warnMin !== undefined && v < stdItem.warnMin) ||
              (stdItem.warnMax !== undefined && v > stdItem.warnMax));
          if (overTol) warnings.push(`${item.name} 实测 ${v}${item.unit ?? ''} 超公差`);
          else if (overWarn) warnings.push(`${item.name} 实测 ${v}${item.unit ?? ''} 超预警值（仍在公差内）`);
        }
      }
      if (warnings.length) {
        await notify({
          toRole: 'qe',
          kind: 'warning',
          title: `批次 ${b.batchNo} 计量数据预警`,
          body: warnings.slice(0, 8).join('；'),
          link: `/batches/${b.id}`,
        });
      }

      // 合格批自动批准（检验设置）
      if (lotPass && std?.autoApprovePass) {
        b.status = 'accepted';
        b.review = {
          reviewerId: 'system',
          reviewerName: '系统自动批准',
          reviewedAt: now,
          decision: 'accept',
          note: '检验标准配置为合格批免审批',
        };
        b.history.push({ at: now, by: 'system', byName: '系统', action: '合格批自动批准接收' });
      } else {
        await notify({
          toRole: 'qe',
          kind: 'approval',
          title: `批次 ${b.batchNo} 待审核`,
          body: `${b.componentTypeName}，初判${lotPass ? '接收' : '拒收'}`,
          link: `/batches/${b.id}`,
        });
      }

      await saveBatch(b);
      return json(b);
    },
  },

  // ---------- 审核处置 ----------
  {
    method: 'POST',
    pattern: /^\/batches\/([0-9a-f-]+)\/review$/,
    roles: ['qe', 'admin'],
    handler: async ({ req, match, auth }) => {
      const b = await getBatch(match[1]);
      if (!b) return fail(404, '批次不存在');
      if (b.status !== 'pending_review') return fail(409, '该批次当前不可审核');
      if (!b.inspection) return fail(409, '缺少检验记录');

      const body = (await req.json()) as {
        decision: 'accept' | 'return' | 'sort' | 'concession' | 'reinspect';
        note?: string;
      };
      const now = new Date().toISOString();
      const decisions: Record<string, { status: BatchStatus; label: string }> = {
        accept: { status: 'accepted', label: '审核通过，合格接收' },
        return: { status: 'rejected_return', label: 'MRB 处置：退货' },
        sort: { status: 'rejected_sort', label: 'MRB 处置：全检挑选' },
        concession: { status: 'concession', label: 'MRB 处置：让步接收' },
        reinspect: { status: 'pending_inspection', label: '退回重新检验' },
      };
      const d = decisions[body.decision];
      if (!d) return fail(400, '无效的处置决定');
      if (b.inspection.lotPass && ['return', 'sort', 'concession'].includes(body.decision)) {
        return fail(400, '检验合格的批次只能选择"合格接收"或"退回重检"');
      }
      if (!b.inspection.lotPass && body.decision === 'accept') {
        return fail(400, '检验不合格的批次不能直接合格接收，请走 MRB 处置（退货/挑选/让步）');
      }
      if (!['accept', 'reinspect'].includes(body.decision) && !body.note?.trim()) {
        return fail(400, 'MRB 处置必须填写处置理由');
      }

      if (body.decision === 'reinspect') {
        b.inspection = undefined;
        b.review = undefined;
      } else {
        b.review = {
          reviewerId: auth.userId,
          reviewerName: auth.name,
          reviewedAt: now,
          decision: body.decision,
          note: body.note,
        };
      }
      b.status = d.status;
      b.history.push({ at: now, by: auth.userId, byName: auth.name, action: d.label, note: body.note });

      // 拒收批自动登记不合格品（方案 4.4.1）
      if (['return', 'sort', 'concession'].includes(body.decision)) {
        const ncr = await autoRegisterNcr(b, auth.userId, auth.name);
        b.history.push({
          at: now,
          by: 'system',
          byName: '系统',
          action: `自动登记不合格品 ${ncr.no}`,
        });
      }

      await saveBatch(b);
      return json(b);
    },
  },

  // ---------- 巡检计划 ----------
  {
    method: 'GET',
    pattern: /^\/patrol-plans$/,
    handler: async () => json(await listByPrefix<PatrolPlan>('patrol-')),
  },
  {
    method: 'POST',
    pattern: /^\/patrol-plans$/,
    roles: ['qe', 'admin'],
    handler: async ({ req }) => {
      const body = (await req.json()) as Partial<PatrolPlan>;
      if (!body.name?.trim()) return fail(400, '请填写计划名称');
      if (!body.line?.trim()) return fail(400, '请填写产线');
      if (!body.standardId) return fail(400, '请选择检验标准');
      const interval = Number(body.intervalHours);
      if (!Number.isFinite(interval) || interval < 0.5 || interval > 720) {
        return fail(400, '巡检间隔须为 0.5–720 小时');
      }
      const std = await getEntity<InspectionStandard>('standard-', body.standardId);
      if (!std) return fail(400, '检验标准不存在');
      const plan: PatrolPlan = {
        id: crypto.randomUUID(),
        name: body.name.trim(),
        line: body.line.trim(),
        process: body.process?.trim() ?? '',
        intervalHours: interval,
        materialId: body.materialId,
        materialName: body.materialName,
        standardId: body.standardId,
        owner: body.owner,
        active: body.active ?? true,
      };
      await putEntity('patrol-', plan.id, plan);
      return json(plan, 201);
    },
  },
  {
    method: 'PUT',
    pattern: /^\/patrol-plans\/([0-9a-f-]+)$/,
    roles: ['qe', 'admin'],
    handler: async ({ req, match }) => {
      const plan = await getEntity<PatrolPlan>('patrol-', match[1]);
      if (!plan) return fail(404, '计划不存在');
      const body = (await req.json()) as Partial<PatrolPlan>;
      const updated = { ...plan, ...body, id: plan.id };
      await putEntity('patrol-', plan.id, updated);
      return json(updated);
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/patrol-plans\/([0-9a-f-]+)$/,
    roles: ['admin'],
    handler: async ({ match }) => {
      await deleteEntity('patrol-', match[1]);
      return json({ ok: true });
    },
  },
  // 生成到期巡检任务（服务端无常驻定时器，由前端进入巡检页或手动触发）
  {
    method: 'POST',
    pattern: /^\/patrol-plans\/generate$/,
    roles: ['inspector', 'qe', 'admin'],
    handler: async ({ auth }) => {
      const plans = (await listByPrefix<PatrolPlan>('patrol-')).filter((p) => p.active);
      const all = await listBatches();
      const now = new Date();
      const generated: string[] = [];
      for (const p of plans) {
        const last = p.lastGeneratedAt ? new Date(p.lastGeneratedAt) : null;
        if (last && now.getTime() - last.getTime() < p.intervalHours * 3600 * 1000) continue;
        const std = await getEntity<InspectionStandard>('standard-', p.standardId);
        if (!std) continue;
        const nowIso = now.toISOString();
        const batch: Batch = {
          id: crypto.randomUUID(),
          batchNo: nextBatchNo(all, 'IPQC', `PL${p.line.replace(/[^A-Za-z0-9]/g, '').slice(0, 6) || 'X'}`),
          kind: 'IPQC',
          componentTypeId: p.materialId ?? 'patrol',
          componentTypeName: p.materialName ?? `${p.line} 巡检`,
          materialId: p.materialId,
          standardId: p.standardId,
          supplier: '—',
          quantity: Math.max(2, std.sampling.fixedN ?? 5),
          arrivalDate: nowIso.slice(0, 10),
          line: p.line,
          process: p.process,
          processInspType: '巡检',
          patrolPlanId: p.id,
          status: 'pending_inspection',
          sampling: getSamplingPlanByConfig(Math.max(2, std.sampling.fixedN ?? 5), std.sampling),
          history: [
            { at: nowIso, by: auth.userId, byName: auth.name, action: `巡检计划"${p.name}"自动生成` },
          ],
          createdBy: 'system',
          createdByName: `巡检计划：${p.name}`,
          createdAt: nowIso,
        };
        all.push(batch);
        await saveBatch(batch);
        p.lastGeneratedAt = nowIso;
        await putEntity('patrol-', p.id, p);
        await notify({
          toRole: 'inspector',
          kind: 'task',
          title: `巡检任务：${p.name}`,
          body: `产线 ${p.line} ${p.process ?? ''} 巡检到期，请执行检验`,
          link: `/batches/${batch.id}`,
        });
        generated.push(batch.batchNo);
      }
      return json({ generated });
    },
  },

  // ---------- 附件上传（沿用） ----------
  {
    method: 'POST',
    pattern: /^\/attachments$/,
    internalOnly: false,
    handler: async ({ req, auth }) => {
      const body = (await req.json()) as { name?: string; contentType?: string; dataBase64?: string };
      if (!body.dataBase64 || !body.contentType?.startsWith('image/')) {
        return fail(400, '仅支持图片附件');
      }
      const bytes = Uint8Array.from(atob(body.dataBase64), (c) => c.charCodeAt(0));
      if (bytes.byteLength > 4 * 1024 * 1024) return fail(400, '图片不能超过 4 MB');
      const id = crypto.randomUUID();
      await fileStore().set(id, bytes.buffer as ArrayBuffer, {
        metadata: { name: body.name ?? 'photo', contentType: body.contentType, by: auth.userId },
      });
      return json({ id }, 201);
    },
  },
];

/** 旧版组部件类型（公开，兼容既有页面） */
export { COMPONENT_TYPES };

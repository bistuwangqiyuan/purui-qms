/**
 * 协同与分析路由：消息中心、我的任务、全景追溯、统计驾驶舱、SPC 数据
 */
import type {
  AuditRecord,
  Batch,
  Capa,
  Complaint,
  Gauge,
  Message,
  Ncr,
  PeriodicTest,
  QualityCost,
  TaskItem,
} from '../../../shared/types';
import { spcSelfTest } from '../../../shared/spc';
import type { Route } from '../lib';
import { fail, getEntity, json, listByPrefix, putEntity } from '../lib';
import { listBatches } from './inspection';

export const collabRoutes: Route[] = [
  // ================= 消息中心 =================
  {
    method: 'GET',
    pattern: /^\/messages$/,
    internalOnly: false,
    handler: async ({ auth }) => {
      const all = await listByPrefix<Message>('message-');
      const mine = all
        .filter((m) => m.toUserId === auth.userId || (m.toRole && m.toRole === auth.role && auth.userType === 'internal'))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 200);
      return json(mine);
    },
  },
  {
    method: 'POST',
    pattern: /^\/messages\/([0-9a-f-]+)\/read$/,
    internalOnly: false,
    handler: async ({ match, auth }) => {
      const m = await getEntity<Message>('message-', match[1]);
      if (!m) return fail(404, '消息不存在');
      if (m.toUserId && m.toUserId !== auth.userId) return fail(403, '无权操作');
      m.read = true;
      await putEntity('message-', m.id, m);
      return json(m);
    },
  },

  // ================= 我的任务（动态聚合） =================
  {
    method: 'GET',
    pattern: /^\/tasks$/,
    handler: async ({ auth }) => {
      const today = new Date().toISOString().slice(0, 10);
      const tasks: TaskItem[] = [];
      const batches = await listBatches();
      if (auth.role === 'inspector' || auth.role === 'admin') {
        for (const b of batches.filter((x) => x.status === 'pending_inspection')) {
          tasks.push({ kind: '待检验', title: `${b.batchNo} ${b.componentTypeName}`, link: `/batches/${b.id}` });
        }
      }
      if (auth.role === 'qe' || auth.role === 'admin') {
        for (const b of batches.filter((x) => x.status === 'pending_review')) {
          tasks.push({ kind: '待审核', title: `${b.batchNo} ${b.componentTypeName}`, link: `/batches/${b.id}` });
        }
        const ncrs = await listByPrefix<Ncr>('ncr-');
        for (const n of ncrs.filter((x) => x.status !== 'closed')) {
          tasks.push({ kind: '不合格品', title: `${n.no} ${n.materialName}`, link: `/ncrs/${n.id}` });
        }
        const complaints = await listByPrefix<Complaint>('complaint-');
        for (const c of complaints.filter((x) => x.status !== 'closed')) {
          tasks.push({ kind: '客诉', title: `${c.no} ${c.customerName}`, link: `/complaints/${c.id}` });
        }
      }
      const capas = await listByPrefix<Capa>('capa-');
      for (const c of capas.filter((x) => x.status !== 'closed')) {
        const overdue = !!c.dueDate && c.dueDate < today;
        tasks.push({ kind: '整改', title: `${c.no} ${c.title}`, link: `/capa/${c.id}`, due: c.dueDate, overdue });
      }
      const audits = await listByPrefix<AuditRecord>('audit-');
      for (const a of audits.filter((x) => x.status !== 'done')) {
        tasks.push({
          kind: '评审',
          title: `${a.no} ${a.checklistName} → ${a.target}`,
          link: `/audits/${a.id}`,
          due: a.plannedDate,
          overdue: a.plannedDate < today,
        });
      }
      const tests = await listByPrefix<PeriodicTest>('test-');
      for (const t of tests.filter((x) => x.status === 'active' && x.nextDue <= today)) {
        tasks.push({ kind: '试验', title: `${t.no} ${t.name}（${t.target}）`, link: '/tests', due: t.nextDue, overdue: true });
      }
      const gauges = await listByPrefix<Gauge>('gauge-');
      for (const g of gauges.filter((x) => x.nextCalib && x.nextCalib <= today)) {
        tasks.push({ kind: '校准', title: `${g.code} ${g.name} 校准到期`, link: '/gauges', due: g.nextCalib, overdue: true });
      }
      return json(tasks);
    },
  },

  // ================= 全景追溯 =================
  {
    method: 'GET',
    pattern: /^\/trace$/,
    handler: async ({ url }) => {
      const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
      if (!q) return fail(400, '请输入批次号/物料/供应商/单号关键字');
      const batches = await listBatches();
      const ncrs = await listByPrefix<Ncr>('ncr-');
      const complaints = await listByPrefix<Complaint>('complaint-');
      const capas = await listByPrefix<Capa>('capa-');
      const costs = await listByPrefix<QualityCost>('cost-');

      const hitBatches = batches.filter((b) =>
        [b.batchNo, b.componentTypeName, b.materialCode, b.supplier, b.poNo, b.shipmentNo, b.supplierLotNo]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
      );
      const batchIds = new Set(hitBatches.map((b) => b.id));
      // 直接命中的 NCR + 由命中批次派生的 NCR
      const hitNcrs = ncrs.filter(
        (n) =>
          (n.batchId && batchIds.has(n.batchId)) ||
          [n.no, n.batchNo, n.materialName, n.supplier].filter(Boolean).some((f) => String(f).toLowerCase().includes(q)),
      );
      const ncrIds = new Set(hitNcrs.map((n) => n.id));
      const hitComplaints = complaints.filter(
        (c) =>
          (c.ncrId && ncrIds.has(c.ncrId)) ||
          [c.no, c.customerName, c.desc].some((f) => String(f).toLowerCase().includes(q)),
      );
      const complaintIds = new Set(hitComplaints.map((c) => c.id));
      const hitCapas = capas.filter(
        (c) =>
          (c.refId && (ncrIds.has(c.refId) || complaintIds.has(c.refId))) ||
          [c.no, c.title, c.supplierName].filter(Boolean).some((f) => String(f).toLowerCase().includes(q)),
      );
      const hitCosts = costs.filter((c) => c.refId && ncrIds.has(c.refId));

      return json({
        batches: hitBatches.map((b) => ({
          id: b.id, batchNo: b.batchNo, kind: b.kind ?? 'IQC', name: b.componentTypeName,
          supplier: b.supplier, status: b.status, date: b.arrivalDate, lotPass: b.inspection?.lotPass,
        })),
        ncrs: hitNcrs.map((n) => ({ id: n.id, no: n.no, name: n.materialName, status: n.status, batchNo: n.batchNo, createdAt: n.createdAt })),
        complaints: hitComplaints.map((c) => ({ id: c.id, no: c.no, customer: c.customerName, status: c.status, createdAt: c.createdAt })),
        capas: hitCapas.map((c) => ({ id: c.id, no: c.no, title: c.title, status: c.status, refNo: c.refNo, createdAt: c.createdAt })),
        costs: hitCosts.map((c) => ({ id: c.id, date: c.date, typePath: c.typePath, amount: c.amount, refNo: c.refNo })),
      });
    },
  },

  // ================= 统计（驾驶舱） =================
  {
    method: 'GET',
    pattern: /^\/stats$/,
    handler: async () => {
      const all = await listBatches();
      const inspected = all.filter((b) => b.inspection);
      const byStatus: Record<string, number> = {};
      for (const b of all) byStatus[b.status] = (byStatus[b.status] ?? 0) + 1;

      const agg = (keyFn: (b: Batch) => string | undefined) => {
        const out: Record<string, { total: number; passed: number }> = {};
        for (const b of inspected) {
          const k = keyFn(b);
          if (!k) continue;
          const s = (out[k] ??= { total: 0, passed: 0 });
          s.total += 1;
          if (b.inspection!.lotPass) s.passed += 1;
        }
        return out;
      };

      // 缺陷柏拉图数据（按检验项目名聚合不合格品数）
      const defectAgg: Record<string, number> = {};
      let totalDefective = 0;
      let totalInspectedUnits = 0;
      for (const b of inspected) {
        totalDefective += b.inspection!.defectiveCount;
        totalInspectedUnits += b.sampling.sampleSize;
        for (const it of b.inspection!.items) {
          if (it.defects > 0) defectAgg[it.name] = (defectAgg[it.name] ?? 0) + it.defects;
        }
      }

      const ncrs = await listByPrefix<Ncr>('ncr-');
      const complaints = await listByPrefix<Complaint>('complaint-');
      const capas = await listByPrefix<Capa>('capa-');
      const costs = await listByPrefix<QualityCost>('cost-');
      const costByType: Record<string, number> = {};
      for (const c of costs) {
        const top = c.typePath.split('/')[0];
        costByType[top] = (costByType[top] ?? 0) + c.amount;
      }

      return json({
        totalBatches: all.length,
        pendingInspection: byStatus['pending_inspection'] ?? 0,
        pendingReview: byStatus['pending_review'] ?? 0,
        inspectedLots: inspected.length,
        passedLots: inspected.filter((b) => b.inspection!.lotPass).length,
        byStatus,
        bySupplier: agg((b) => (b.kind === 'IQC' || !b.kind ? b.supplier : undefined)),
        byComponent: agg((b) => b.componentTypeName),
        byMonth: (() => {
          const out: Record<string, { total: number; passed: number }> = {};
          for (const b of inspected) {
            const m = b.inspection!.inspectedAt.slice(0, 7);
            const s = (out[m] ??= { total: 0, passed: 0 });
            s.total += 1;
            if (b.inspection!.lotPass) s.passed += 1;
          }
          return out;
        })(),
        byKind: (() => {
          const out: Record<string, { total: number; passed: number }> = {};
          for (const b of inspected) {
            const k = b.kind ?? 'IQC';
            const s = (out[k] ??= { total: 0, passed: 0 });
            s.total += 1;
            if (b.inspection!.lotPass) s.passed += 1;
          }
          return out;
        })(),
        defectPareto: Object.entries(defectAgg).map(([name, count]) => ({ name, count })),
        ppm: totalInspectedUnits ? Math.round((totalDefective / totalInspectedUnits) * 1e6) : 0,
        openNcrs: ncrs.filter((n) => n.status !== 'closed').length,
        openComplaints: complaints.filter((c) => c.status !== 'closed').length,
        openCapas: capas.filter((c) => c.status !== 'closed').length,
        costTotal: costs.reduce((a, c) => a + c.amount, 0),
        costByType,
      });
    },
  },

  // ================= SPC 数据 =================
  // 某物料/组部件 + 检验条目的全部计量数据（按批次分组，供 Xbar-R / 直方图 / Cpk）
  {
    method: 'GET',
    pattern: /^\/spc\/series$/,
    handler: async ({ url }) => {
      const typeId = url.searchParams.get('typeId');
      const itemId = url.searchParams.get('itemId');
      if (!typeId || !itemId) return fail(400, '缺少参数 typeId/itemId');
      const all = (await listBatches())
        .filter((b) => (b.materialId ?? b.componentTypeId) === typeId && b.inspection)
        .sort((a, b) => (a.inspection!.inspectedAt < b.inspection!.inspectedAt ? -1 : 1));
      const groups: { batchNo: string; date: string; values: number[] }[] = [];
      let min: number | undefined;
      let max: number | undefined;
      let unit: string | undefined;
      let itemName = '';
      for (const b of all) {
        const it = b.inspection!.items.find((x) => x.templateId === itemId);
        if (!it || it.kind !== 'quantitative' || !it.values?.length) continue;
        groups.push({ batchNo: b.batchNo, date: b.inspection!.inspectedAt.slice(0, 10), values: it.values });
        min = it.min ?? min;
        max = it.max ?? max;
        unit = it.unit ?? unit;
        itemName = it.name;
      }
      return json({ itemName, unit, lsl: min, usl: max, groups });
    },
  },
  // 自检端点：与 scripts/verify_spc.py 相同数据集的计算结果（交叉校验）
  {
    method: 'GET',
    pattern: /^\/spc\/selftest$/,
    internalOnly: false,
    handler: async () => json(spcSelfTest()),
  },
];

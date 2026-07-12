/**
 * 质量改进路由：不合格品（NCR）、客户投诉、CAPA/8D、问题发现
 */
import type { Capa, CapaStatus, Complaint, Issue, Ncr, QualityCost } from '../../../shared/types';
import type { AuthInfo, Route } from '../lib';
import { fail, getEntity, json, listByPrefix, nextNo, notify, putEntity } from '../lib';

function now(): string {
  return new Date().toISOString();
}

function hist(auth: AuthInfo, action: string, note?: string) {
  return { at: now(), by: auth.userId, byName: auth.name, action, note };
}

/** 从来源单据创建 CAR（供 NCR/客诉/问题/评审共用） */
export async function createCapa(
  auth: AuthInfo,
  data: {
    title: string;
    source: Capa['source'];
    refId?: string;
    refNo?: string;
    owner?: string;
    supplierId?: string;
    supplierName?: string;
    dueDate?: string;
    d2Problem?: string;
  },
): Promise<Capa> {
  const existing = await listByPrefix<Capa>('capa-');
  const capa: Capa = {
    id: crypto.randomUUID(),
    no: nextNo('CAR', existing.length),
    title: data.title,
    source: data.source,
    refId: data.refId,
    refNo: data.refNo,
    owner: data.owner || auth.name,
    supplierId: data.supplierId,
    supplierName: data.supplierName,
    dueDate: data.dueDate,
    status: 'open',
    d2Problem: data.d2Problem,
    history: [hist(auth, `发起整改（来源：${data.source}${data.refNo ? ` ${data.refNo}` : ''}）`)],
    createdAt: now(),
  };
  await putEntity('capa-', capa.id, capa);
  await notify({
    toRole: 'qe',
    kind: 'task',
    title: `新整改单 ${capa.no}`,
    body: capa.title,
    link: `/capa/${capa.id}`,
  });
  return capa;
}

export const qualityRoutes: Route[] = [
  // ================= 不合格品 NCR =================
  {
    method: 'GET',
    pattern: /^\/ncrs$/,
    internalOnly: false,
    handler: async ({ auth }) => {
      let list = await listByPrefix<Ncr>('ncr-');
      if (auth.userType === 'supplier') {
        list = list.filter((n) => n.shareWithSupplier && n.supplierId === auth.partnerId);
      } else if (auth.userType === 'customer') {
        list = [];
      }
      return json(list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
    },
  },
  {
    method: 'GET',
    pattern: /^\/ncrs\/([0-9a-f-]+)$/,
    internalOnly: false,
    handler: async ({ match, auth }) => {
      const n = await getEntity<Ncr>('ncr-', match[1]);
      if (!n) return fail(404, '不合格品单不存在');
      if (auth.userType === 'supplier' && !(n.shareWithSupplier && n.supplierId === auth.partnerId)) {
        return fail(404, '不合格品单不存在');
      }
      if (auth.userType === 'customer') return fail(403, '无权访问');
      return json(n);
    },
  },
  {
    method: 'POST',
    pattern: /^\/ncrs$/,
    roles: ['inspector', 'qe', 'admin'],
    handler: async ({ req, auth }) => {
      const body = (await req.json()) as Partial<Ncr>;
      if (!body.materialName?.trim()) return fail(400, '请填写物料/产品名称');
      if (!body.defectDesc?.trim()) return fail(400, '请填写不合格描述');
      const qty = Math.floor(Number(body.qty));
      if (!Number.isFinite(qty) || qty < 1) return fail(400, '不合格数量须为正整数');
      const existing = await listByPrefix<Ncr>('ncr-');
      const ncr: Ncr = {
        id: crypto.randomUUID(),
        no: nextNo('NCR', existing.length),
        source: 'manual',
        materialName: body.materialName.trim(),
        supplier: body.supplier?.trim(),
        supplierId: body.supplierId,
        qty,
        defectDesc: body.defectDesc.trim(),
        defectCodeId: body.defectCodeId,
        severity: body.severity ?? 'Ma',
        status: 'open',
        shareWithSupplier: body.shareWithSupplier ?? false,
        owner: body.owner,
        history: [hist(auth, '手动登记不合格品')],
        createdAt: now(),
      };
      await putEntity('ncr-', ncr.id, ncr);
      return json(ncr, 201);
    },
  },
  // 处置
  {
    method: 'POST',
    pattern: /^\/ncrs\/([0-9a-f-]+)\/disposition$/,
    roles: ['qe', 'admin'],
    handler: async ({ req, match, auth }) => {
      const n = await getEntity<Ncr>('ncr-', match[1]);
      if (!n) return fail(404, '不合格品单不存在');
      if (n.status === 'closed') return fail(409, '该单已关闭');
      const body = (await req.json()) as {
        disposition: Ncr['disposition'];
        note?: string;
        cost?: number;
        costBearer?: string;
        startCapa?: boolean;
        close?: boolean;
      };
      if (!body.disposition) return fail(400, '请选择处置方式');
      if (!body.note?.trim()) return fail(400, '请填写处置说明');
      n.disposition = body.disposition;
      n.dispositionNote = body.note.trim();
      n.status = body.close ? 'closed' : 'processing';
      if (body.cost !== undefined && Number.isFinite(Number(body.cost))) {
        n.cost = Number(body.cost);
        n.costBearer = body.costBearer?.trim();
        // 同步登记质量成本（方案 14 项）
        const costs = await listByPrefix<QualityCost>('cost-');
        const c: QualityCost = {
          id: crypto.randomUUID(),
          date: now().slice(0, 10),
          typePath: n.source === 'complaint' ? '外部损失/客诉处理' : '内部损失/不合格品处置',
          amount: n.cost,
          refKind: 'ncr',
          refId: n.id,
          refNo: n.no,
          bearer: n.costBearer,
          note: `不合格品 ${n.no} 处置费用`,
          createdBy: auth.name,
        };
        void costs;
        await putEntity('cost-', c.id, c);
      }
      n.history.push(hist(auth, `处置：${body.disposition}${body.close ? '，关闭' : ''}`, body.note));
      if (body.startCapa && !n.carId) {
        const capa = await createCapa(auth, {
          title: `不合格品整改：${n.materialName} ${n.defectDesc.slice(0, 40)}`,
          source: 'ncr',
          refId: n.id,
          refNo: n.no,
          supplierId: n.supplierId,
          supplierName: n.supplier,
          d2Problem: n.defectDesc,
        });
        n.carId = capa.id;
        n.history.push(hist(auth, `发起 CAPA ${capa.no}`));
      }
      await putEntity('ncr-', n.id, n);
      return json(n);
    },
  },

  // ================= 客户投诉 =================
  {
    method: 'GET',
    pattern: /^\/complaints$/,
    internalOnly: false,
    handler: async ({ auth }) => {
      let list = await listByPrefix<Complaint>('complaint-');
      if (auth.userType === 'customer') list = list.filter((c) => c.customerId === auth.partnerId);
      else if (auth.userType === 'supplier') list = [];
      return json(list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
    },
  },
  {
    method: 'GET',
    pattern: /^\/complaints\/([0-9a-f-]+)$/,
    internalOnly: false,
    handler: async ({ match, auth }) => {
      const c = await getEntity<Complaint>('complaint-', match[1]);
      if (!c) return fail(404, '客诉单不存在');
      if (auth.userType === 'customer' && c.customerId !== auth.partnerId) return fail(404, '客诉单不存在');
      if (auth.userType === 'supplier') return fail(403, '无权访问');
      return json(c);
    },
  },
  {
    method: 'POST',
    pattern: /^\/complaints$/,
    internalOnly: false, // 客户用户可登记自己的投诉
    handler: async ({ req, auth }) => {
      if (auth.userType === 'supplier') return fail(403, '供应商用户无权登记客诉');
      const body = (await req.json()) as Partial<Complaint>;
      if (!body.desc?.trim()) return fail(400, '请填写投诉描述');
      const customerName =
        auth.userType === 'customer' ? auth.name : body.customerName?.trim();
      if (!customerName) return fail(400, '请填写客户名称');
      const existing = await listByPrefix<Complaint>('complaint-');
      const c: Complaint = {
        id: crypto.randomUUID(),
        no: nextNo('CC', existing.length),
        customerId: auth.userType === 'customer' ? auth.partnerId : body.customerId,
        customerName,
        typePath: body.typePath?.trim() || '产品质量/其他',
        severity: body.severity ?? 'Ma',
        priority: body.priority ?? '中',
        desc: body.desc.trim(),
        productInfo: body.productInfo?.trim(),
        owner: body.owner,
        status: 'open',
        history: [hist(auth, '登记客户投诉')],
        createdAt: now(),
      };
      await putEntity('complaint-', c.id, c);
      await notify({
        toRole: 'qe',
        kind: 'task',
        title: `新客诉 ${c.no}（${c.priority}优先级）`,
        body: `${customerName}：${c.desc.slice(0, 60)}`,
        link: `/complaints/${c.id}`,
      });
      return json(c, 201);
    },
  },
  // 客诉处理（登记不合格品 / 发起CAR / 关闭）
  {
    method: 'POST',
    pattern: /^\/complaints\/([0-9a-f-]+)\/action$/,
    roles: ['qe', 'admin'],
    handler: async ({ req, match, auth }) => {
      const c = await getEntity<Complaint>('complaint-', match[1]);
      if (!c) return fail(404, '客诉单不存在');
      if (c.status === 'closed') return fail(409, '该客诉已关闭');
      const body = (await req.json()) as {
        note?: string;
        registerNcr?: boolean;
        startCapa?: boolean;
        close?: boolean;
        cost?: number;
        owner?: string;
      };
      if (body.owner) c.owner = body.owner;
      if (body.note?.trim()) c.history.push(hist(auth, '处理记录', body.note.trim()));
      if (body.cost !== undefined && Number.isFinite(Number(body.cost))) c.cost = Number(body.cost);
      if (body.registerNcr && !c.ncrId) {
        const ncrs = await listByPrefix<Ncr>('ncr-');
        const ncr: Ncr = {
          id: crypto.randomUUID(),
          no: nextNo('NCR', ncrs.length),
          source: 'complaint',
          materialName: c.productInfo || c.typePath,
          qty: 1,
          defectDesc: c.desc,
          severity: c.severity,
          status: 'open',
          history: [hist(auth, `由客诉 ${c.no} 登记`)],
          createdAt: now(),
        };
        await putEntity('ncr-', ncr.id, ncr);
        c.ncrId = ncr.id;
        c.history.push(hist(auth, `登记不合格品 ${ncr.no}`));
      }
      if (body.startCapa && !c.carId) {
        const capa = await createCapa(auth, {
          title: `客诉整改：${c.customerName} ${c.desc.slice(0, 40)}`,
          source: 'complaint',
          refId: c.id,
          refNo: c.no,
          d2Problem: c.desc,
        });
        c.carId = capa.id;
        c.history.push(hist(auth, `发起 CAPA ${capa.no}`));
      }
      if (body.close) {
        if (!body.note?.trim()) return fail(400, '关闭客诉须填写处理说明');
        c.status = 'closed';
        c.history.push(hist(auth, '客诉关闭'));
      } else if (c.status === 'open') {
        c.status = 'processing';
      }
      await putEntity('complaint-', c.id, c);
      return json(c);
    },
  },

  // ================= CAPA / 8D =================
  {
    method: 'GET',
    pattern: /^\/capas$/,
    internalOnly: false,
    handler: async ({ auth }) => {
      let list = await listByPrefix<Capa>('capa-');
      if (auth.userType === 'supplier') list = list.filter((c) => c.supplierId === auth.partnerId);
      else if (auth.userType === 'customer') list = [];
      return json(list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
    },
  },
  {
    method: 'GET',
    pattern: /^\/capas\/([0-9a-f-]+)$/,
    internalOnly: false,
    handler: async ({ match, auth }) => {
      const c = await getEntity<Capa>('capa-', match[1]);
      if (!c) return fail(404, '整改单不存在');
      if (auth.userType === 'supplier' && c.supplierId !== auth.partnerId) return fail(404, '整改单不存在');
      if (auth.userType === 'customer') return fail(403, '无权访问');
      return json(c);
    },
  },
  {
    method: 'POST',
    pattern: /^\/capas$/,
    roles: ['qe', 'admin'],
    handler: async ({ req, auth }) => {
      const body = (await req.json()) as Partial<Capa>;
      if (!body.title?.trim()) return fail(400, '请填写整改主题');
      const capa = await createCapa(auth, {
        title: body.title.trim(),
        source: 'manual',
        owner: body.owner,
        supplierId: body.supplierId,
        supplierName: body.supplierName,
        dueDate: body.dueDate,
        d2Problem: body.d2Problem,
      });
      return json(capa, 201);
    },
  },
  // 更新 8D 内容与状态（供应商用户可更新被指派给自己的 CAR）
  {
    method: 'PUT',
    pattern: /^\/capas\/([0-9a-f-]+)$/,
    internalOnly: false,
    handler: async ({ req, match, auth }) => {
      const c = await getEntity<Capa>('capa-', match[1]);
      if (!c) return fail(404, '整改单不存在');
      if (auth.userType === 'customer') return fail(403, '无权访问');
      if (auth.userType === 'supplier' && c.supplierId !== auth.partnerId) return fail(404, '整改单不存在');
      if (auth.userType === 'internal' && !['qe', 'admin', 'inspector'].includes(auth.role)) {
        return fail(403, '无权修改');
      }
      if (c.status === 'closed') return fail(409, '整改单已关闭');
      const body = (await req.json()) as Partial<Capa> & { statusNote?: string };
      const fields: (keyof Capa)[] = [
        'title', 'owner', 'dueDate',
        'd1Team', 'd2Problem', 'd3Containment', 'd4RootCause',
        'd5Corrective', 'd6Implementation', 'd7Prevention', 'd8Closure',
      ];
      for (const f of fields) {
        if (body[f] !== undefined) (c as unknown as Record<string, unknown>)[f] = body[f];
      }
      if (body.status && body.status !== c.status) {
        const order: CapaStatus[] = ['open', 'analyzing', 'implementing', 'verifying', 'closed'];
        if (!order.includes(body.status)) return fail(400, '状态无效');
        // 关闭校验：8D 关键步骤须填写（供应商用户不能自行关闭）
        if (body.status === 'closed') {
          if (auth.userType !== 'internal' || !['qe', 'admin'].includes(auth.role)) {
            return fail(403, '仅质量工程师或管理员可关闭整改单');
          }
          if (!c.d4RootCause?.trim() || !c.d5Corrective?.trim()) {
            return fail(400, '关闭前须完成 D4 根本原因与 D5 纠正措施');
          }
        }
        c.status = body.status;
        c.history.push(hist(auth, `状态更新：${body.status}`, body.statusNote));
      } else if (body.statusNote?.trim()) {
        c.history.push(hist(auth, '进展记录', body.statusNote.trim()));
      }
      await putEntity('capa-', c.id, c);
      return json(c);
    },
  },

  // ================= 问题发现 =================
  {
    method: 'GET',
    pattern: /^\/issues$/,
    handler: async () =>
      json((await listByPrefix<Issue>('issue-')).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))),
  },
  {
    method: 'POST',
    pattern: /^\/issues$/,
    roles: ['inspector', 'qe', 'admin'],
    handler: async ({ req, auth }) => {
      const body = (await req.json()) as Partial<Issue>;
      if (!body.desc?.trim()) return fail(400, '请填写问题描述');
      const existing = await listByPrefix<Issue>('issue-');
      const issue: Issue = {
        id: crypto.randomUUID(),
        no: nextNo('PF', existing.length),
        typePath: body.typePath?.trim() || '现场问题/其他',
        source: body.source ?? 'manual',
        refId: body.refId,
        desc: body.desc.trim(),
        owner: body.owner,
        status: 'open',
        history: [hist(auth, '登记问题')],
        createdAt: now(),
      };
      await putEntity('issue-', issue.id, issue);
      return json(issue, 201);
    },
  },
  {
    method: 'POST',
    pattern: /^\/issues\/([0-9a-f-]+)\/action$/,
    roles: ['qe', 'admin'],
    handler: async ({ req, match, auth }) => {
      const issue = await getEntity<Issue>('issue-', match[1]);
      if (!issue) return fail(404, '问题不存在');
      const body = (await req.json()) as { note?: string; startCapa?: boolean; close?: boolean };
      if (body.note?.trim()) issue.history.push(hist(auth, '处理记录', body.note.trim()));
      if (body.startCapa && !issue.carId) {
        const capa = await createCapa(auth, {
          title: `问题整改：${issue.desc.slice(0, 40)}`,
          source: 'issue',
          refId: issue.id,
          refNo: issue.no,
          d2Problem: issue.desc,
        });
        issue.carId = capa.id;
        issue.history.push(hist(auth, `发起 CAPA ${capa.no}`));
      }
      if (body.close) {
        issue.status = 'closed';
        issue.history.push(hist(auth, '问题关闭'));
      } else if (issue.status === 'open') {
        issue.status = 'processing';
      }
      await putEntity('issue-', issue.id, issue);
      return json(issue);
    },
  },
];

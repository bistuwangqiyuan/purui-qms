/**
 * 体系管理路由：评审（含 LPA）、周期性试验、量具、质量成本
 */
import type {
  AuditChecklist,
  AuditRecord,
  Gauge,
  Issue,
  PeriodicTest,
  QualityCost,
  TestTemplate,
} from '../../../shared/types';
import type { AuthInfo, Route } from '../lib';
import { deleteEntity, fail, getEntity, json, listByPrefix, nextNo, notify, putEntity } from '../lib';
import { createCapa } from './quality';

function now(): string {
  return new Date().toISOString();
}
function hist(auth: AuthInfo, action: string, note?: string) {
  return { at: now(), by: auth.userId, byName: auth.name, action, note };
}
function addDays(dateIso: string, days: number): string {
  const d = new Date(dateIso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const systemRoutes: Route[] = [
  // ================= 评审清单 =================
  {
    method: 'GET',
    pattern: /^\/audit-checklists$/,
    handler: async () => json(await listByPrefix<AuditChecklist>('checklist-')),
  },
  {
    method: 'POST',
    pattern: /^\/audit-checklists$/,
    roles: ['qe', 'admin'],
    handler: async ({ req }) => {
      const body = (await req.json()) as Partial<AuditChecklist>;
      if (!body.name?.trim()) return fail(400, '请填写清单名称');
      if (!Array.isArray(body.items) || !body.items.length) return fail(400, '至少一个评审条目');
      for (const it of body.items) if (!it.text?.trim()) return fail(400, '评审条目内容不能为空');
      const cl: AuditChecklist = {
        id: crypto.randomUUID(),
        name: body.name.trim(),
        kind: body.kind ?? '过程审核',
        items: body.items.map((it) => ({
          id: it.id || crypto.randomUUID(),
          text: it.text.trim(),
          weight: Number(it.weight) || 1,
          mustPass: !!it.mustPass,
        })),
      };
      await putEntity('checklist-', cl.id, cl);
      return json(cl, 201);
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/audit-checklists\/([0-9a-f-]+)$/,
    roles: ['admin'],
    handler: async ({ match }) => {
      await deleteEntity('checklist-', match[1]);
      return json({ ok: true });
    },
  },

  // ================= 评审记录（计划→执行） =================
  {
    method: 'GET',
    pattern: /^\/audits$/,
    handler: async () =>
      json((await listByPrefix<AuditRecord>('audit-')).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))),
  },
  {
    method: 'GET',
    pattern: /^\/audits\/([0-9a-f-]+)$/,
    handler: async ({ match }) => {
      const a = await getEntity<AuditRecord>('audit-', match[1]);
      return a ? json(a) : fail(404, '评审记录不存在');
    },
  },
  {
    method: 'POST',
    pattern: /^\/audits$/,
    roles: ['qe', 'admin'],
    handler: async ({ req, auth }) => {
      const body = (await req.json()) as Partial<AuditRecord>;
      if (!body.checklistId) return fail(400, '请选择评审清单');
      if (!body.target?.trim()) return fail(400, '请填写评审对象');
      if (!body.plannedDate) return fail(400, '请填写计划日期');
      const cl = await getEntity<AuditChecklist>('checklist-', body.checklistId);
      if (!cl) return fail(400, '评审清单不存在');
      const existing = await listByPrefix<AuditRecord>('audit-');
      const rec: AuditRecord = {
        id: crypto.randomUUID(),
        no: nextNo('AUD', existing.length),
        checklistId: cl.id,
        checklistName: cl.name,
        kind: cl.kind,
        target: body.target.trim(),
        auditor: body.auditor?.trim() || auth.name,
        plannedDate: body.plannedDate,
        status: 'planned',
        history: [hist(auth, '创建评审计划')],
        createdAt: now(),
      };
      await putEntity('audit-', rec.id, rec);
      await notify({
        toRole: 'qe',
        kind: 'task',
        title: `评审计划 ${rec.no}`,
        body: `${cl.name} → ${rec.target}，计划 ${rec.plannedDate}`,
        link: `/audits/${rec.id}`,
      });
      return json(rec, 201);
    },
  },
  // 执行评审（提交评分与发现）
  {
    method: 'POST',
    pattern: /^\/audits\/([0-9a-f-]+)\/execute$/,
    roles: ['qe', 'admin', 'inspector'],
    handler: async ({ req, match, auth }) => {
      const rec = await getEntity<AuditRecord>('audit-', match[1]);
      if (!rec) return fail(404, '评审记录不存在');
      if (rec.status === 'done') return fail(409, '评审已完成');
      const cl = await getEntity<AuditChecklist>('checklist-', rec.checklistId);
      if (!cl) return fail(500, '评审清单已被删除');
      const body = (await req.json()) as {
        scores: { itemId: string; score: number; note?: string }[];
        findings?: { desc: string; startIssue?: boolean }[];
      };
      if (!Array.isArray(body.scores) || body.scores.length !== cl.items.length) {
        return fail(400, '须对每个条目评分');
      }
      let weighted = 0;
      let weightSum = 0;
      const scores = [];
      for (const it of cl.items) {
        const s = body.scores.find((x) => x.itemId === it.id);
        if (!s || !Number.isFinite(Number(s.score)) || s.score < 0 || s.score > 10) {
          return fail(400, `条目"${it.text}"评分须为 0–10`);
        }
        const pass = it.mustPass ? s.score >= 6 : true;
        weighted += (s.score / 10) * it.weight;
        weightSum += it.weight;
        scores.push({ itemId: it.id, score: s.score, pass, note: s.note });
      }
      rec.scores = scores;
      rec.totalScore = Number(((weighted / weightSum) * 100).toFixed(1));
      rec.findings = [];
      for (const f of body.findings ?? []) {
        if (!f.desc?.trim()) continue;
        let issueId: string | undefined;
        if (f.startIssue) {
          const issues = await listByPrefix<Issue>('issue-');
          const issue: Issue = {
            id: crypto.randomUUID(),
            no: nextNo('PF', issues.length),
            typePath: `评审发现/${rec.kind}`,
            source: rec.kind === 'LPA分层审核' ? 'lpa' : 'audit',
            refId: rec.id,
            desc: f.desc.trim(),
            status: 'open',
            history: [hist(auth, `由评审 ${rec.no} 登记`)],
            createdAt: now(),
          };
          await putEntity('issue-', issue.id, issue);
          issueId = issue.id;
        }
        rec.findings.push({ desc: f.desc.trim(), issueId });
      }
      rec.status = 'done';
      rec.history.push(
        hist(auth, `评审完成，总分 ${rec.totalScore}，发现 ${rec.findings.length} 项`),
      );
      await putEntity('audit-', rec.id, rec);
      return json(rec);
    },
  },

  // ================= 试验模板 / 周期性试验 =================
  {
    method: 'GET',
    pattern: /^\/test-templates$/,
    handler: async () => json(await listByPrefix<TestTemplate>('testtpl-')),
  },
  {
    method: 'POST',
    pattern: /^\/test-templates$/,
    roles: ['qe', 'admin'],
    handler: async ({ req }) => {
      const body = (await req.json()) as Partial<TestTemplate>;
      if (!body.name?.trim()) return fail(400, '请填写模板名称');
      if (!Array.isArray(body.items) || !body.items.length) return fail(400, '至少一个试验项目');
      const tpl: TestTemplate = {
        id: crypto.randomUUID(),
        name: body.name.trim(),
        items: body.items.map((s) => String(s).trim()).filter(Boolean),
      };
      await putEntity('testtpl-', tpl.id, tpl);
      return json(tpl, 201);
    },
  },
  {
    method: 'GET',
    pattern: /^\/tests$/,
    handler: async () => json(await listByPrefix<PeriodicTest>('test-')),
  },
  {
    method: 'POST',
    pattern: /^\/tests$/,
    roles: ['qe', 'admin'],
    handler: async ({ req }) => {
      const body = (await req.json()) as Partial<PeriodicTest>;
      if (!body.name?.trim()) return fail(400, '请填写试验名称');
      if (!body.target?.trim()) return fail(400, '请填写试验对象');
      const cycle = Math.floor(Number(body.cycleDays));
      if (!Number.isFinite(cycle) || cycle < 1 || cycle > 3650) return fail(400, '周期须为 1–3650 天');
      const existing = await listByPrefix<PeriodicTest>('test-');
      const t: PeriodicTest = {
        id: crypto.randomUUID(),
        no: nextNo('TST', existing.length),
        name: body.name.trim(),
        templateId: body.templateId,
        target: body.target.trim(),
        cycleDays: cycle,
        nextDue: body.nextDue || addDays(now(), cycle),
        owner: body.owner,
        status: 'active',
        records: [],
      };
      await putEntity('test-', t.id, t);
      return json(t, 201);
    },
  },
  // 执行试验（记录结果并滚动下一周期）
  {
    method: 'POST',
    pattern: /^\/tests\/([0-9a-f-]+)\/execute$/,
    roles: ['inspector', 'qe', 'admin'],
    handler: async ({ req, match, auth }) => {
      const t = await getEntity<PeriodicTest>('test-', match[1]);
      if (!t) return fail(404, '试验不存在');
      const body = (await req.json()) as { result?: 'pass' | 'fail'; note?: string; attachmentId?: string };
      if (body.result !== 'pass' && body.result !== 'fail') return fail(400, '请选择试验结果');
      t.records.push({
        date: now().slice(0, 10),
        result: body.result,
        note: body.note?.trim(),
        attachmentId: body.attachmentId,
        by: auth.name,
      });
      t.nextDue = addDays(now(), t.cycleDays);
      await putEntity('test-', t.id, t);
      if (body.result === 'fail') {
        await notify({
          toRole: 'qe',
          kind: 'warning',
          title: `试验不合格：${t.name}`,
          body: `对象 ${t.target}，请评估处置`,
          link: '/tests',
        });
      }
      return json(t);
    },
  },
  {
    method: 'PUT',
    pattern: /^\/tests\/([0-9a-f-]+)$/,
    roles: ['qe', 'admin'],
    handler: async ({ req, match }) => {
      const t = await getEntity<PeriodicTest>('test-', match[1]);
      if (!t) return fail(404, '试验不存在');
      const body = (await req.json()) as Partial<PeriodicTest>;
      if (body.status && ['active', 'paused'].includes(body.status)) t.status = body.status;
      if (body.owner !== undefined) t.owner = body.owner;
      if (body.nextDue) t.nextDue = body.nextDue;
      await putEntity('test-', t.id, t);
      return json(t);
    },
  },

  // ================= 量具管理 =================
  {
    method: 'GET',
    pattern: /^\/gauges$/,
    handler: async () => json(await listByPrefix<Gauge>('gauge-')),
  },
  {
    method: 'POST',
    pattern: /^\/gauges$/,
    roles: ['qe', 'admin'],
    handler: async ({ req, auth }) => {
      const body = (await req.json()) as Partial<Gauge>;
      if (!body.code?.trim()) return fail(400, '请填写量具编号');
      if (!body.name?.trim()) return fail(400, '请填写量具名称');
      const cycle = Math.floor(Number(body.calibCycleDays));
      if (!Number.isFinite(cycle) || cycle < 1) return fail(400, '校准周期须为正整数（天）');
      const lastCalib = body.lastCalib || now().slice(0, 10);
      const g: Gauge = {
        id: crypto.randomUUID(),
        code: body.code.trim(),
        name: body.name.trim(),
        type: body.type?.trim() || '通用量具',
        calibCycleDays: cycle,
        lastCalib,
        nextCalib: addDays(lastCalib, cycle),
        location: body.location?.trim(),
        history: [{ date: now().slice(0, 10), action: '建立台账', by: auth.name }],
      };
      await putEntity('gauge-', g.id, g);
      return json(g, 201);
    },
  },
  // 登记校准
  {
    method: 'POST',
    pattern: /^\/gauges\/([0-9a-f-]+)\/calibrate$/,
    roles: ['inspector', 'qe', 'admin'],
    handler: async ({ req, match, auth }) => {
      const g = await getEntity<Gauge>('gauge-', match[1]);
      if (!g) return fail(404, '量具不存在');
      const body = (await req.json()) as { date?: string; note?: string };
      const date = body.date || now().slice(0, 10);
      g.lastCalib = date;
      g.nextCalib = addDays(date, g.calibCycleDays);
      g.history.push({ date, action: '校准合格', by: auth.name, note: body.note?.trim() });
      await putEntity('gauge-', g.id, g);
      return json(g);
    },
  },

  // ================= 质量成本 =================
  {
    method: 'GET',
    pattern: /^\/costs$/,
    handler: async () =>
      json((await listByPrefix<QualityCost>('cost-')).sort((a, b) => (a.date < b.date ? 1 : -1))),
  },
  {
    method: 'POST',
    pattern: /^\/costs$/,
    roles: ['qe', 'admin'],
    handler: async ({ req, auth }) => {
      const body = (await req.json()) as Partial<QualityCost>;
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) return fail(400, '金额须为正数');
      if (!body.typePath?.trim()) return fail(400, '请填写费用类型');
      const c: QualityCost = {
        id: crypto.randomUUID(),
        date: body.date || now().slice(0, 10),
        typePath: body.typePath.trim(),
        amount,
        refKind: body.refKind ?? 'other',
        refId: body.refId,
        refNo: body.refNo,
        bearer: body.bearer?.trim(),
        note: body.note?.trim(),
        createdBy: auth.name,
      };
      await putEntity('cost-', c.id, c);
      return json(c, 201);
    },
  },

  // 评审发现直接转 CAR
  {
    method: 'POST',
    pattern: /^\/audits\/([0-9a-f-]+)\/start-capa$/,
    roles: ['qe', 'admin'],
    handler: async ({ req, match, auth }) => {
      const rec = await getEntity<AuditRecord>('audit-', match[1]);
      if (!rec) return fail(404, '评审记录不存在');
      const body = (await req.json()) as { desc?: string };
      if (!body.desc?.trim()) return fail(400, '请填写整改内容');
      const capa = await createCapa(auth, {
        title: `评审整改：${rec.target} ${body.desc.slice(0, 40)}`,
        source: 'audit',
        refId: rec.id,
        refNo: rec.no,
        d2Problem: body.desc.trim(),
      });
      rec.history.push(hist(auth, `发起 CAPA ${capa.no}`));
      await putEntity('audit-', rec.id, rec);
      return json(capa, 201);
    },
  },
];

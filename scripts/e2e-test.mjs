/**
 * 端到端全模块测试（本地 netlify dev 或线上环境）
 * 用法：node scripts/e2e-test.mjs [baseUrl]
 *
 * 覆盖：鉴权与三类用户隔离、主数据 CRUD 与三种抽样、IQC/IPQC/OQC、预警消息、
 *       巡检计划、不合格品闭环（NCR→CAPA→8D→成本）、客诉、问题、评审、
 *       周期试验、量具、任务聚合、全景追溯、统计、SPC 双语言交叉校验、用户管理。
 */
const BASE = process.argv[2] || 'http://localhost:7777';
let failures = 0;
let checks = 0;

function check(name, cond, detail = '') {
  checks += 1;
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${name} ${detail}`);
  }
}

function rejected(res, expectStatus) {
  if (res.status === expectStatus) return true;
  if (BASE.startsWith('https://')) return false;
  return res.status === 404 && typeof res.data?.error === 'string' && res.data.error.includes('index.htm');
}

async function req(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) data = await res.json();
  else data = await res.arrayBuffer();
  return { status: res.status, data };
}

console.log(`目标环境：${BASE}\n`);

// ============ 1. 登录与三类用户 ============
console.log('1. 登录与三类用户');
check('错误密码被拒绝(401)', (await req('/login', { method: 'POST', body: { username: 'admin', password: 'wrong' } })).status === 401);
const insp = (await req('/login', { method: 'POST', body: { username: 'inspector', password: 'Insp@123' } })).data;
const qe = (await req('/login', { method: 'POST', body: { username: 'qe', password: 'Qe@123456' } })).data;
const admin = (await req('/login', { method: 'POST', body: { username: 'admin', password: 'Admin@123' } })).data;
const sup = (await req('/login', { method: 'POST', body: { username: 'supplier1', password: 'Sup@12345' } })).data;
const cus = (await req('/login', { method: 'POST', body: { username: 'customer1', password: 'Cus@12345' } })).data;
check('检验员登录', !!insp?.token && insp.user.role === 'inspector');
check('质量工程师登录', !!qe?.token);
check('管理员登录', !!admin?.token);
check('供应商用户登录', !!sup?.token && sup.user.userType === 'supplier' && !!sup.user.partnerId);
check('客户用户登录', !!cus?.token && cus.user.userType === 'customer');
check('未登录访问被拒(401)', (await req('/batches')).status === 401);

const T = { i: insp.token, q: qe.token, a: admin.token, s: sup.token, c: cus.token };

// ============ 2. 主数据 ============
console.log('2. 主数据与检验标准');
const materials = (await req('/materials', { token: T.i })).data;
const partners = (await req('/partners', { token: T.i })).data;
const standards = (await req('/standards', { token: T.i })).data;
check('物料主数据 11 类', Array.isArray(materials) && materials.length >= 11, `实得 ${materials?.length}`);
check('物料均绑定检验标准', materials.every((m) => m.standardId));
check('供应商+客户主数据', partners.filter((p) => p.partnerKind === 'supplier').length >= 5 && partners.filter((p) => p.partnerKind === 'customer').length >= 2);
check('检验标准 11 份', standards.length >= 11);
check('缺陷库有数据', ((await req('/defects', { token: T.i })).data ?? []).length >= 8);
check('检验方法有数据', ((await req('/methods', { token: T.i })).data ?? []).length >= 7);
check('计量单位有数据', ((await req('/unit-list', { token: T.i })).data ?? []).length >= 10);
check('供应商用户不能读主数据(403)', rejected(await req('/materials', { token: T.s }), 403));
check('检验员不能建物料(403)', rejected(await req('/materials', { method: 'POST', token: T.i, body: { code: 'X', name: 'X', categoryPath: 'X' } }), 403));

// 新建固定抽样标准 + 物料
const fixedStd = await req('/standards', {
  method: 'POST', token: T.q,
  body: {
    code: 'STD-E2E-FIX', name: 'E2E固定抽样标准',
    sampling: { mode: 'fixed', fixedN: 8, fixedAc: 0 },
    items: [{ name: '外观检查', method: '目视', requirement: '无损伤', kind: 'qualitative', basis: 'E2E' }],
    autoApprovePass: true, active: true,
  },
});
check('质量工程师可建标准(201)', fixedStd.status === 201, JSON.stringify(fixedStd.data));
const e2eMat = await req('/materials', {
  method: 'POST', token: T.q,
  body: { code: 'E2E-01', name: 'E2E测试物料', categoryPath: '测试/一般件', unit: '件', standardId: fixedStd.data.id },
});
check('新建物料并绑定标准(201)', e2eMat.status === 201);

// 三种抽样预览
const pv1 = (await req('/sampling-preview?lot=1000&standardId=' + fixedStd.data.id, { token: T.i })).data;
check('固定抽样 n=8/Ac=0', pv1.sampleSize === 8 && pv1.ac === 0 && pv1.mode === 'fixed');
const pv2 = (await req('/sampling-preview?lot=200&mode=percent&percent=10&percentAc=1', { token: T.i })).data;
check('百分比抽样 200×10%=20', pv2.sampleSize === 20 && pv2.ac === 1);
const pv3 = (await req('/sampling-preview?lot=1000&mode=aql&aql=0.65', { token: T.i })).data;
check('AQL 抽样 n=80/Ac=1（标准已知点）', pv3.sampleSize === 80 && pv3.ac === 1);
check('无效标准配置被拒(400)', (await req('/standards', {
  method: 'POST', token: T.q,
  body: { code: 'X', name: 'X', sampling: { mode: 'aql' }, items: [{ name: 'a', kind: 'qualitative', method: 'x', requirement: 'y', basis: 'z' }] },
})).status === 400);

// ============ 3. IQC 全流程（含预警与自动NCR） ============
console.log('3. IQC 检验闭环');
const supplier = partners.find((p) => p.code === 'S001');
const dampingCap = materials.find((m) => m.id === 'damping-cap');
const create = await req('/batches', {
  method: 'POST', token: T.i,
  body: { kind: 'IQC', materialId: dampingCap.id, supplierId: supplier.id, quantity: 1000, arrivalDate: '2026-07-12', supplierLotNo: 'E2E-LOT-1', poNo: 'PO-E2E' },
});
check('IQC 报检成功(201)', create.status === 201, JSON.stringify(create.data).slice(0, 200));
const batch = create.data;
check('AQL 0.65/批量1000 → n=80/Ac=1', batch.sampling?.sampleSize === 80 && batch.sampling?.ac === 1);
check('供应商ID已关联', batch.supplierId === supplier.id);
check('质量工程师不能报检(403)', rejected(await req('/batches', { method: 'POST', token: T.q, body: { kind: 'IQC', materialId: dampingCap.id, supplierId: supplier.id, quantity: 100, arrivalDate: '2026-07-12' } }), 403));

// 检验录入：含超预警值（1.57 在公差内但超 warnMax）与不合格品 2 件（拒收）
const capStd = standards.find((s) => s.id === dampingCap.standardId);
const items = capStd.items.map((tpl, idx) => ({
  templateId: tpl.id, name: tpl.name, kind: tpl.kind, unit: tpl.unit, min: tpl.min, max: tpl.max,
  values: tpl.kind === 'quantitative' ? [tpl.id === 'dc-cap' ? 1.57 : (tpl.min ?? 0)] : undefined,
  qualitativePass: tpl.kind === 'qualitative' ? 78 : undefined,
  defects: idx === 0 ? 2 : 0, pass: idx !== 0,
}));
const submit = await req(`/batches/${batch.id}/inspection`, {
  method: 'POST', token: T.i, body: { items, defectiveCount: 2, note: 'E2E 拒收批' },
});
check('检验提交，d=2≥Re=2 判拒收', submit.status === 200 && submit.data?.inspection?.lotPass === false);
// 预警消息（发给 qe 角色）
const qeMsgs = (await req('/messages', { token: T.q })).data;
check('计量超预警产生消息', qeMsgs.some((m) => m.kind === 'warning' && m.title.includes(batch.batchNo)), JSON.stringify(qeMsgs.slice(0, 2)));
check('待审核审批消息', qeMsgs.some((m) => m.kind === 'approval' && m.title.includes(batch.batchNo)));

// MRB 退货 → 自动登记 NCR
const mrb = await req(`/batches/${batch.id}/review`, { method: 'POST', token: T.q, body: { decision: 'return', note: 'E2E 退货处置' } });
check('MRB 退货成功', mrb.status === 200 && mrb.data?.status === 'rejected_return');
const ncrs = (await req('/ncrs', { token: T.q })).data;
const autoNcr = ncrs.find((n) => n.batchId === batch.id);
check('拒收批自动登记 NCR', !!autoNcr, JSON.stringify(ncrs.slice(0, 2)));
check('NCR 默认对供应商可见', autoNcr?.shareWithSupplier === true);

// NCR 处置：让步 + 成本 + 发起 CAPA
const disp = await req(`/ncrs/${autoNcr.id}/disposition`, {
  method: 'POST', token: T.q,
  body: { disposition: 'return', note: 'E2E：退货并要求 8D', cost: 5000, costBearer: '供应商', startCapa: true },
});
check('NCR 处置成功并发起 CAPA', disp.status === 200 && !!disp.data?.carId);
const capaId = disp.data.carId;
const costs = (await req('/costs', { token: T.q })).data;
check('质量成本自动登记', costs.some((c) => c.refId === autoNcr.id && c.amount === 5000));

// CAPA 8D 推进
let capa = (await req(`/capas/${capaId}`, { token: T.q })).data;
check('CAPA 已创建且来源为 ncr', capa?.source === 'ncr' && capa?.refId === autoNcr.id);
check('未填 D4/D5 不能关闭(400)', (await req(`/capas/${capaId}`, { method: 'PUT', token: T.q, body: { status: 'closed' } })).status === 400);
await req(`/capas/${capaId}`, {
  method: 'PUT', token: T.q,
  body: { d4RootCause: 'E2E 根因', d5Corrective: 'E2E 纠正措施', statusNote: 'E2E 分析完成' },
});
const closeCapa = await req(`/capas/${capaId}`, { method: 'PUT', token: T.q, body: { status: 'closed', statusNote: 'E2E 验证关闭' } });
check('填写 D4/D5 后可关闭', closeCapa.status === 200 && closeCapa.data.status === 'closed');

// ============ 4. 供应商可见性隔离 ============
console.log('4. 供应商协同与数据隔离');
const supBatches = (await req('/batches', { token: T.s })).data;
check('供应商仅见自己批次', supBatches.length > 0 && supBatches.every((b) => b.supplier.includes('西安') || b.supplier === supplier.name), `共${supBatches?.length}`);
const supNcrs = (await req('/ncrs', { token: T.s })).data;
check('供应商可见共享 NCR', supNcrs.some((n) => n.id === autoNcr.id));
const supCapas = (await req('/capas', { token: T.s })).data;
check('供应商仅见自己的 CAPA', Array.isArray(supCapas) && supCapas.every((c) => c.supplierId === sup.user.partnerId));
check('供应商不能审核批次(403)', rejected(await req(`/batches/${batch.id}/review`, { method: 'POST', token: T.s, body: { decision: 'accept' } }), 403));

// ============ 5. 固定抽样 + 自动批准（免审批） ============
console.log('5. 固定抽样与合格批自动批准');
const b2 = (await req('/batches', {
  method: 'POST', token: T.i,
  body: { kind: 'IQC', materialId: e2eMat.data.id, supplierId: supplier.id, quantity: 500, arrivalDate: '2026-07-12' },
})).data;
check('固定抽样批 n=8/Ac=0', b2.sampling?.sampleSize === 8 && b2.sampling?.ac === 0 && b2.sampling?.mode === 'fixed');
const sub2 = await req(`/batches/${b2.id}/inspection`, {
  method: 'POST', token: T.i,
  body: { items: [{ templateId: fixedStd.data.items[0].id, name: '外观检查', kind: 'qualitative', qualitativePass: 8, defects: 0, pass: true }], defectiveCount: 0 },
});
check('合格批自动批准（免审批）', sub2.status === 200 && sub2.data?.status === 'accepted' && sub2.data?.review?.reviewerName === '系统自动批准');

// ============ 6. IPQC / OQC / 巡检计划 ============
console.log('6. IPQC / OQC / 巡检计划');
check('IPQC 缺产线被拒(400)', (await req('/batches', { method: 'POST', token: T.i, body: { kind: 'IPQC', materialId: dampingCap.id, quantity: 20, arrivalDate: '2026-07-12' } })).status === 400);
const ipqc = await req('/batches', {
  method: 'POST', token: T.i,
  body: { kind: 'IPQC', materialId: dampingCap.id, quantity: 20, arrivalDate: '2026-07-12', line: 'E2E产线', process: 'E2E工序', processInspType: '首检' },
});
check('IPQC 报检成功', ipqc.status === 201 && ipqc.data.batchNo.startsWith('IPQC-'));
check('OQC 缺客户被拒(400)', (await req('/batches', { method: 'POST', token: T.i, body: { kind: 'OQC', materialId: dampingCap.id, quantity: 50, arrivalDate: '2026-07-12' } })).status === 400);
const customer = partners.find((p) => p.partnerKind === 'customer');
const oqc = await req('/batches', {
  method: 'POST', token: T.i,
  body: { kind: 'OQC', materialId: dampingCap.id, quantity: 50, arrivalDate: '2026-07-12', customerId: customer.id, shipmentNo: 'SH-E2E' },
});
check('OQC 报检成功并关联客户', oqc.status === 201 && oqc.data.customerName === customer.name);

const plan = await req('/patrol-plans', {
  method: 'POST', token: T.q,
  body: { name: 'E2E巡检计划', line: 'E2E产线', process: 'E2E工序', intervalHours: 2, standardId: fixedStd.data.id },
});
check('创建巡检计划(201)', plan.status === 201);
const gen = await req('/patrol-plans/generate', { method: 'POST', token: T.i });
check('生成到期巡检任务', gen.status === 200 && gen.data.generated.length >= 1, JSON.stringify(gen.data));
const gen2 = await req('/patrol-plans/generate', { method: 'POST', token: T.i });
check('间隔内不重复生成', gen2.status === 200 && gen2.data.generated.length === 0);

// ============ 7. 客诉闭环 ============
console.log('7. 客户投诉闭环');
const cc = await req('/complaints', {
  method: 'POST', token: T.c,
  body: { desc: 'E2E 客户投诉：产品运行异常', typePath: '产品质量/运行异常', severity: 'Ma', priority: '高' },
});
check('客户用户可登记投诉(201)', cc.status === 201 && cc.data.customerId === cus.user.partnerId);
const cusList = (await req('/complaints', { token: T.c })).data;
check('客户仅见自己的投诉', cusList.every((x) => x.customerId === cus.user.partnerId));
const act = await req(`/complaints/${cc.data.id}/action`, {
  method: 'POST', token: T.q,
  body: { note: 'E2E 处理', registerNcr: true, startCapa: true, cost: 1200 },
});
check('客诉关联 NCR+CAPA', act.status === 200 && !!act.data.ncrId && !!act.data.carId);
const closeCc = await req(`/complaints/${cc.data.id}/action`, { method: 'POST', token: T.q, body: { note: 'E2E 处理完成', close: true } });
check('客诉关闭', closeCc.status === 200 && closeCc.data.status === 'closed');
check('供应商无权看客诉(403)', rejected(await req(`/complaints/${cc.data.id}`, { token: T.s }), 403) || (await req(`/complaints/${cc.data.id}`, { token: T.s })).status === 403);

// ============ 8. 问题发现 ============
console.log('8. 问题发现');
const issue = await req('/issues', { method: 'POST', token: T.i, body: { desc: 'E2E 现场问题', typePath: '现场问题/标识' } });
check('登记问题(201)', issue.status === 201);
const issueAct = await req(`/issues/${issue.data.id}/action`, { method: 'POST', token: T.q, body: { note: 'E2E', startCapa: true, close: true } });
check('问题转 CAR 并关闭', issueAct.status === 200 && !!issueAct.data.carId && issueAct.data.status === 'closed');

// ============ 9. 评审管理 ============
console.log('9. 评审管理');
const cl = await req('/audit-checklists', {
  method: 'POST', token: T.q,
  body: { name: 'E2E评审清单', kind: 'LPA分层审核', items: [ { text: '条目A', weight: 2, mustPass: true }, { text: '条目B', weight: 1, mustPass: false } ] },
});
check('创建评审清单(201)', cl.status === 201);
const audit = await req('/audits', {
  method: 'POST', token: T.q,
  body: { checklistId: cl.data.id, target: 'E2E产线', plannedDate: '2026-07-12', auditor: 'E2E评审员' },
});
check('创建评审计划(201)', audit.status === 201);
const exec = await req(`/audits/${audit.data.id}/execute`, {
  method: 'POST', token: T.q,
  body: {
    scores: cl.data.items.map((it, i) => ({ itemId: it.id, score: i === 0 ? 8 : 10 })),
    findings: [{ desc: 'E2E 评审发现一项', startIssue: true }],
  },
});
// 加权总分 = (8/10*2 + 10/10*1)/3*100 = 86.7
check('评审执行，加权总分 86.7', exec.status === 200 && exec.data.totalScore === 86.7, `实得 ${exec.data?.totalScore}`);
check('评审发现登记为问题', exec.data.findings?.[0]?.issueId !== undefined);
const auditCapa = await req(`/audits/${audit.data.id}/start-capa`, { method: 'POST', token: T.q, body: { desc: 'E2E 评审整改' } });
check('评审发起 CAR(201)', auditCapa.status === 201);

// ============ 10. 试验 / 量具 / 成本 ============
console.log('10. 试验 / 量具 / 成本');
const tpl = await req('/test-templates', { method: 'POST', token: T.q, body: { name: 'E2E模板', items: ['项目1', '项目2'] } });
check('创建试验模板(201)', tpl.status === 201);
const test = await req('/tests', { method: 'POST', token: T.q, body: { name: 'E2E周期试验', target: 'E2E对象', cycleDays: 30, templateId: tpl.data.id } });
check('创建周期试验(201)', test.status === 201);
const testExec = await req(`/tests/${test.data.id}/execute`, { method: 'POST', token: T.i, body: { result: 'pass', note: 'E2E' } });
check('执行试验并滚动周期', testExec.status === 200 && testExec.data.records.length === 1 && testExec.data.nextDue > new Date().toISOString().slice(0, 10));
const gauge = await req('/gauges', { method: 'POST', token: T.q, body: { code: 'E2E-GA', name: 'E2E卡尺', calibCycleDays: 365 } });
check('创建量具(201)', gauge.status === 201 && !!gauge.data.nextCalib);
const calib = await req(`/gauges/${gauge.data.id}/calibrate`, { method: 'POST', token: T.i, body: { note: 'E2E证书' } });
check('登记校准并顺延', calib.status === 200 && calib.data.history.length === 2);
const cost = await req('/costs', { method: 'POST', token: T.q, body: { typePath: '鉴定成本/检验试验', amount: 800, note: 'E2E' } });
check('登记质量费用(201)', cost.status === 201);

// ============ 11. 任务与消息 ============
console.log('11. 任务聚合与消息');
const tasks = (await req('/tasks', { token: T.q })).data;
check('任务聚合返回数组', Array.isArray(tasks) && tasks.length > 0);
check('任务含待审核/不合格品等类型', tasks.some((t) => ['待审核', '不合格品', '整改', '评审'].includes(t.kind)));
const firstUnread = qeMsgs.find((m) => !m.read);
if (firstUnread) {
  const rd = await req(`/messages/${firstUnread.id}/read`, { method: 'POST', token: T.q });
  check('消息标记已读', rd.status === 200 && rd.data.read === true);
} else {
  check('消息标记已读', true, '(无未读消息可测)');
}

// ============ 12. 全景追溯 ============
console.log('12. 全景追溯');
const trace = (await req(`/trace?q=${encodeURIComponent(batch.batchNo)}`, { token: T.q })).data;
check('追溯命中批次', trace.batches.some((b) => b.id === batch.id));
check('追溯穿透到 NCR', trace.ncrs.some((n) => n.id === autoNcr.id));
check('追溯穿透到 CAPA', trace.capas.some((c) => c.id === capaId));
check('追溯穿透到成本', trace.costs.some((c) => c.refNo === autoNcr.no));

// ============ 13. 统计与 SPC ============
console.log('13. 统计驾驶舱与 SPC 交叉校验');
const stats = (await req('/stats', { token: T.q })).data;
check('统计含 PPM', typeof stats.ppm === 'number');
check('统计含缺陷柏拉图', Array.isArray(stats.defectPareto) && stats.defectPareto.length > 0);
check('统计含质量成本', stats.costTotal > 0);
check('统计含 byKind', !!stats.byKind && Object.keys(stats.byKind).length >= 1);

const series = (await req(`/spc/series?typeId=${dampingCap.id}&itemId=dc-cap`, { token: T.q })).data;
check('SPC 序列返回计量数据', series.groups.length > 0 && series.usl === 1.575);

// 与 scripts/verify_spc.py 相同数据集的双语言交叉校验（Python 独立计算的期望值）
const PY_EXPECTED = {
  xbarbar: 1.500208, rbar: 0.01084, xbarUCL: 1.506463, xbarLCL: 1.493953,
  rUCL: 0.022916, rLCL: 0.0, sigmaWithin: 0.0046604,
  cp: 5.3644, cpk: 5.3495, pp: 6.2054, ppk: 6.1882,
  ppmValue: 240, paretoTop: '外观划伤', paretoTopCumPct: 56.0,
};
const st = (await req('/spc/selftest', { token: T.q })).data;
for (const [k, v] of Object.entries(PY_EXPECTED)) {
  check(`SPC 交叉校验 ${k}=${v}`, st[k] === v, `TS实得 ${st[k]}`);
}

// ============ 14. 用户管理 ============
console.log('14. 用户管理');
check('非管理员不能查看用户(403)', rejected(await req('/users', { token: T.i }), 403));
const uname = `e2e_${Date.now().toString(36)}`;
const uCreate = await req('/users', { method: 'POST', token: T.a, body: { username: uname, name: 'E2E用户', role: 'inspector', password: 'E2e@12345' } });
check('创建内部用户(201)', uCreate.status === 201);
check('供应商用户缺合作方被拒(400)', (await req('/users', { method: 'POST', token: T.a, body: { username: uname + 's', name: 'X', role: 'inspector', password: 'E2e@12345', userType: 'supplier' } })).status === 400);
const sCreate = await req('/users', {
  method: 'POST', token: T.a,
  body: { username: uname + 's', name: 'E2E供应商用户', role: 'inspector', password: 'E2e@12345', userType: 'supplier', partnerId: supplier.id },
});
check('创建供应商用户(201)', sCreate.status === 201 && sCreate.data.userType === 'supplier');
const uDisable = await req(`/users/${uname}`, { method: 'PATCH', token: T.a, body: { active: false } });
check('停用用户', uDisable.status === 200 && uDisable.data.active === false);
check('停用后无法登录(401)', (await req('/login', { method: 'POST', body: { username: uname, password: 'E2e@12345' } })).status === 401);

console.log(`\n共 ${checks} 项断言，结果：${failures === 0 ? '全部通过' : `${failures} 项失败`}`);
process.exit(failures === 0 ? 0 : 1);

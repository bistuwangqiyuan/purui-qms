/**
 * 端到端业务流程自测脚本（针对本地 netlify dev 或线上环境）
 * 用法：node scripts/e2e-test.mjs [baseUrl]
 * 覆盖：登录（3角色）→ 来料登记 → 抽样方案校验 → 越权校验 → 检验录入（含照片上传）
 *       → 审核处置 → 拒收批 MRB → 统计接口 → 用户管理。
 */
const BASE = process.argv[2] || 'http://localhost:7777';
let failures = 0;

function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${name} ${detail}`);
  }
}

/**
 * 判断"请求被拒绝"。生产环境返回真实的 403/401；
 * 本地 netlify dev 的代理会把函数的 4xx 响应按 pretty-URL 重写再转发一次
 * （已知 CLI 行为差异），最终表现为 404。两种情形均视为"被拒绝"。
 */
function rejected(res, expectStatus) {
  if (res.status === expectStatus) return true;
  if (BASE.startsWith('https://')) return false; // 线上环境严格校验状态码
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

// 1. 登录
console.log('1. 登录与鉴权');
const badLogin = await req('/login', { method: 'POST', body: { username: 'admin', password: 'wrong' } });
check('错误密码被拒绝(401)', badLogin.status === 401);

const insp = (await req('/login', { method: 'POST', body: { username: 'inspector', password: 'Insp@123' } })).data;
const qe = (await req('/login', { method: 'POST', body: { username: 'qe', password: 'Qe@123456' } })).data;
const admin = (await req('/login', { method: 'POST', body: { username: 'admin', password: 'Admin@123' } })).data;
check('检验员登录成功', !!insp?.token && insp.user.role === 'inspector');
check('质量工程师登录成功', !!qe?.token && qe.user.role === 'qe');
check('管理员登录成功', !!admin?.token && admin.user.role === 'admin');

const noAuth = await req('/batches');
check('未登录访问业务接口被拒绝(401)', noAuth.status === 401);

// 2. 来料登记与抽样方案
console.log('2. 来料登记与 GB/T 2828.1 抽样方案');
const create = await req('/batches', {
  method: 'POST',
  token: insp.token,
  body: {
    componentTypeId: 'thyristor',
    supplier: '自动化测试供应商',
    supplierLotNo: 'E2E-LOT-001',
    quantity: 1000,
    arrivalDate: '2026-07-12',
    poNo: 'PO-E2E-001',
    project: 'E2E 自动化验证',
  },
});
check('来料登记成功(201)', create.status === 201, JSON.stringify(create.data));
const batch = create.data;
// 晶闸管 AQL 0.65，批量1000 → 字码J，n=80，Ac=1，Re=2（GB/T 2828.1 表2-A 已知点）
check('抽样方案 n=80', batch.sampling?.sampleSize === 80, `实得 ${batch.sampling?.sampleSize}`);
check('抽样方案 Ac=1/Re=2', batch.sampling?.ac === 1 && batch.sampling?.re === 2, `实得 Ac=${batch.sampling?.ac}`);
check('状态为待检验', batch.status === 'pending_inspection');

const qeCreate = await req('/batches', {
  method: 'POST',
  token: qe.token,
  body: { componentTypeId: 'thyristor', supplier: 'X', quantity: 100, arrivalDate: '2026-07-12' },
});
check('质量工程师不能登记来料(403)', rejected(qeCreate, 403));

// 3. 附件上传
console.log('3. 检验照片上传');
// 1x1 红色 PNG
const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const up = await req('/attachments', {
  method: 'POST',
  token: insp.token,
  body: { name: 'e2e.png', contentType: 'image/png', dataBase64: pngBase64 },
});
check('照片上传成功(201)', up.status === 201, JSON.stringify(up.data));
const photoId = up.data?.id;
const download = await req(`/attachments/${photoId}`);
check('照片可回读', download.status === 200 && download.data.byteLength > 40);

// 4. 检验录入（合格批）
console.log('4. 检验录入与批判定');
const types = (await req('/component-types')).data;
const thyristor = types.find((t) => t.id === 'thyristor');
const items = thyristor.items.map((tpl) => ({
  templateId: tpl.id,
  name: tpl.name,
  kind: tpl.kind,
  unit: tpl.unit,
  min: tpl.min,
  max: tpl.max,
  values: tpl.kind === 'quantitative' ? [tpl.min ?? tpl.max ?? 1] : undefined,
  qualitativePass: tpl.kind === 'qualitative' ? 80 : undefined,
  defects: 0,
  pass: true,
}));
const qeInspect = await req(`/batches/${batch.id}/inspection`, {
  method: 'POST', token: qe.token, body: { items, defectiveCount: 0 },
});
check('质量工程师不能录入检验(403)', rejected(qeInspect, 403));

const submit = await req(`/batches/${batch.id}/inspection`, {
  method: 'POST',
  token: insp.token,
  body: { items, defectiveCount: 1, attachmentIds: [photoId], note: 'E2E 合格批（d=1≤Ac=1）' },
});
check('检验提交成功', submit.status === 200, JSON.stringify(submit.data));
check('d=1≤Ac=1 判为接收', submit.data?.inspection?.lotPass === true);
check('状态为待审核', submit.data?.status === 'pending_review');

// 5. 审核（合格批）
console.log('5. 审核处置');
const inspReview = await req(`/batches/${batch.id}/review`, {
  method: 'POST', token: insp.token, body: { decision: 'accept' },
});
check('检验员不能审核(403)', rejected(inspReview, 403));

const wrongDecision = await req(`/batches/${batch.id}/review`, {
  method: 'POST', token: qe.token, body: { decision: 'return', note: 'x' },
});
check('合格批不允许退货(400)', wrongDecision.status === 400);

const accept = await req(`/batches/${batch.id}/review`, {
  method: 'POST', token: qe.token, body: { decision: 'accept', note: 'E2E 审核接收' },
});
check('合格批审核接收成功', accept.status === 200 && accept.data?.status === 'accepted');

// 6. 拒收批 MRB 流程
console.log('6. 拒收批 MRB 处置');
const create2 = await req('/batches', {
  method: 'POST',
  token: insp.token,
  body: { componentTypeId: 'busbar', supplier: '自动化测试供应商', quantity: 400, arrivalDate: '2026-07-12' },
});
const batch2 = create2.data;
// 母排 AQL 2.5，批量400 → H，n=50，Ac=3（标准已知点）
check('母排批量400 → n=50/Ac=3', batch2.sampling?.sampleSize === 50 && batch2.sampling?.ac === 3,
  `实得 n=${batch2.sampling?.sampleSize},Ac=${batch2.sampling?.ac}`);
const busbar = types.find((t) => t.id === 'busbar');
const items2 = busbar.items.map((tpl, i) => ({
  templateId: tpl.id, name: tpl.name, kind: tpl.kind, unit: tpl.unit, min: tpl.min, max: tpl.max,
  values: tpl.kind === 'quantitative' ? [tpl.min ?? 1] : undefined,
  qualitativePass: tpl.kind === 'qualitative' ? 46 : undefined,
  defects: i === 0 ? 4 : 0, pass: i !== 0,
}));
const submit2 = await req(`/batches/${batch2.id}/inspection`, {
  method: 'POST', token: insp.token,
  body: { items: items2, defectiveCount: 4, note: 'E2E 拒收批（d=4≥Re=4）' },
});
check('d=4≥Re=4 判为拒收', submit2.data?.inspection?.lotPass === false);

const acceptBad = await req(`/batches/${batch2.id}/review`, {
  method: 'POST', token: qe.token, body: { decision: 'accept' },
});
check('拒收批不允许直接接收(400)', acceptBad.status === 400);
const noNote = await req(`/batches/${batch2.id}/review`, {
  method: 'POST', token: qe.token, body: { decision: 'return' },
});
check('MRB 处置必须填理由(400)', noNote.status === 400);
const mrb = await req(`/batches/${batch2.id}/review`, {
  method: 'POST', token: qe.token, body: { decision: 'return', note: '外观不合格品数超限，整批退货并要求 8D 报告' },
});
check('MRB 退货处置成功', mrb.status === 200 && mrb.data?.status === 'rejected_return');

// 7. 统计与台账
console.log('7. 统计与台账');
const stats = (await req('/stats', { token: qe.token })).data;
check('统计包含新增批次', stats.totalBatches >= 14, `totalBatches=${stats.totalBatches}`);
check('统计含供应商维度', !!stats.bySupplier?.['自动化测试供应商']);
const list = (await req('/batches', { token: insp.token })).data;
check('台账可查询', Array.isArray(list) && list.some((b) => b.id === batch.id));
const detail = (await req(`/batches/${batch.id}`, { token: qe.token })).data;
check('详情含完整流转记录', detail.history?.length >= 3);

// 8. 用户管理
console.log('8. 用户管理（管理员）');
const uList = await req('/users', { token: insp.token });
check('非管理员不能查看用户(403)', rejected(uList, 403));
const uname = `e2e_${Date.now().toString(36)}`;
const uCreate = await req('/users', {
  method: 'POST', token: admin.token,
  body: { username: uname, name: 'E2E 测试用户', role: 'inspector', password: 'E2e@12345' },
});
check('管理员创建用户成功(201)', uCreate.status === 201, JSON.stringify(uCreate.data));
const uLogin = await req('/login', { method: 'POST', body: { username: uname, password: 'E2e@12345' } });
check('新用户可登录', uLogin.status === 200);
const uDisable = await req(`/users/${uname}`, { method: 'PATCH', token: admin.token, body: { active: false } });
check('停用用户成功', uDisable.status === 200 && uDisable.data?.active === false);
const uLogin2 = await req('/login', { method: 'POST', body: { username: uname, password: 'E2e@12345' } });
check('停用后无法登录(401)', uLogin2.status === 401);

console.log(`\n结果：${failures === 0 ? '全部通过' : `${failures} 项失败`}`);
process.exit(failures === 0 ? 0 : 1);

/**
 * 初始播种：演示账号、主数据（物料/供应商/客户/单位/缺陷/方法/检验标准）、
 * 演示批次与不合格品→CAPA→客诉闭环、评审/试验/量具/成本演示数据。
 *
 * 演示业务数据全部带 demo 标记、由固定随机种子生成（可复核），
 * 与真实业务数据严格区分；修改本文件后递增 SEED_VERSION 触发重播种。
 */
import bcrypt from 'bcryptjs';
import type {
  AuditChecklist,
  AuditRecord,
  Batch,
  Capa,
  Complaint,
  DefectCode,
  Gauge,
  InspectionItemResult,
  InspectionMethod,
  InspectionStandard,
  Material,
  Ncr,
  Partner,
  PeriodicTest,
  QualityCost,
  Role,
  TestTemplate,
  Unit,
  UserType,
  UserWithHash,
} from '../../shared/types';
import { getSamplingPlan } from '../../shared/sampling';
import { COMPONENT_TYPES, DEMO_SUPPLIERS } from '../../shared/masterdata';
import { batchStore, dataStore, listByPrefix, putEntity, usersStore } from './lib';

const SEED_VERSION = 'v5';

/** 自动化测试/边界测试使用的供应商名，播种时一并清理 */
const TEST_SUPPLIERS = new Set(['自动化测试供应商', '边界测试', '上海测试供应商UI', 'E2E测试供应商']);

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SeedCtx {
  rand: () => number;
  suppliers: Partner[];
  customers: Partner[];
  materials: Material[];
  standards: InspectionStandard[];
}

// ---------------- 用户 ----------------

const DEMO_USERS: {
  username: string; name: string; role: Role; password: string; userType?: UserType; partnerCode?: string;
}[] = [
  { username: 'admin', name: '系统管理员', role: 'admin', password: 'Admin@123' },
  { username: 'qe', name: '钱质量（质量工程师）', role: 'qe', password: 'Qe@123456' },
  { username: 'inspector', name: '简检验（检验员）', role: 'inspector', password: 'Insp@123' },
  { username: 'supplier1', name: '西安半导体器件供应商A', role: 'inspector', password: 'Sup@12345', userType: 'supplier', partnerCode: 'S001' },
  { username: 'customer1', name: '某特高压工程业主（演示客户）', role: 'inspector', password: 'Cus@12345', userType: 'customer', partnerCode: 'C001' },
];

// ---------------- 主数据 ----------------

function buildPartners(): Partner[] {
  const suppliers: Partner[] = DEMO_SUPPLIERS.map((name, i) => ({
    id: crypto.randomUUID(),
    code: `S${String(i + 1).padStart(3, '0')}`,
    name,
    partnerKind: 'supplier',
    type: i < 2 ? '器件供应商' : '组部件供应商',
    contact: '（演示数据）',
    active: true,
    demo: true,
  }));
  const customers: Partner[] = [
    { id: crypto.randomUUID(), code: 'C001', name: '某特高压工程业主（演示客户）', partnerKind: 'customer', type: '工程业主', active: true, demo: true },
    { id: crypto.randomUUID(), code: 'C002', name: '某柔直工程总包（演示客户）', partnerKind: 'customer', type: '工程总包', active: true, demo: true },
  ];
  return [...suppliers, ...customers];
}

/** 由 11 类换流阀组部件模板迁移为电子化检验标准 + 物料 */
function buildStandardsAndMaterials(): { standards: InspectionStandard[]; materials: Material[] } {
  const standards: InspectionStandard[] = [];
  const materials: Material[] = [];
  for (const ct of COMPONENT_TYPES) {
    const std: InspectionStandard = {
      id: crypto.randomUUID(),
      code: `STD-${ct.code}`,
      name: `${ct.name}来料检验标准`,
      description: ct.description,
      sampling: { mode: 'aql', aql: ct.aql },
      items: ct.items.map((it) => ({
        id: it.id,
        name: it.name,
        method: it.method,
        requirement: it.requirement,
        kind: it.kind,
        unit: it.unit,
        min: it.min,
        max: it.max,
        // 预警值：公差限内收缩 20%（演示默认，正式使用按技术协议修订）
        warnMin: it.min !== undefined && it.max !== undefined ? it.min + (it.max - it.min) * 0.1 : undefined,
        warnMax: it.min !== undefined && it.max !== undefined ? it.max - (it.max - it.min) * 0.1 : undefined,
        special: ct.category === '关键件' && it.kind === 'quantitative',
        basis: it.basis,
      })),
      skipRule: ct.category === '一般件' ? { enabled: true, consecutivePass: 5, skipOneOf: 3 } : undefined,
      autoApprovePass: false,
      active: true,
      demo: true,
    };
    standards.push(std);
    materials.push({
      id: ct.id, // 复用组部件 ID，兼容旧批次数据
      code: ct.code,
      name: ct.name,
      categoryPath: `换流阀组部件/${ct.category}`,
      unit: '件',
      spec: ct.description.slice(0, 60),
      standardId: std.id,
      active: true,
      demo: true,
    });
  }
  return { standards, materials };
}

const UNITS: Omit<Unit, 'id'>[] = [
  { name: '件', symbol: '件' }, { name: '毫米', symbol: 'mm' }, { name: '伏特', symbol: 'V' },
  { name: '毫安', symbol: 'mA' }, { name: '微法', symbol: 'μF' }, { name: '欧姆', symbol: 'Ω' },
  { name: '毫欧', symbol: 'mΩ' }, { name: '兆欧', symbol: 'MΩ' }, { name: '微米', symbol: 'μm' },
  { name: '分贝', symbol: 'dB' },
];

const DEFECTS: Omit<DefectCode, 'id'>[] = [
  { code: 'D-APP-01', name: '外观划伤/磕碰', severity: 'Mi', score: 1, demo: true },
  { code: 'D-APP-02', name: '标识缺失/不清', severity: 'Mi', score: 1, demo: true },
  { code: 'D-DIM-01', name: '尺寸超差', severity: 'Ma', score: 5, demo: true },
  { code: 'D-ELE-01', name: '电参数超差', severity: 'Ma', score: 5, demo: true },
  { code: 'D-ELE-02', name: '绝缘失效/击穿', severity: 'Cr', score: 10, demo: true },
  { code: 'D-SEA-01', name: '密封渗漏', severity: 'Cr', score: 10, demo: true },
  { code: 'D-PKG-01', name: '包装破损', severity: 'Mi', score: 1, demo: true },
  { code: 'D-DOC-01', name: '质量证明文件缺失', severity: 'Ma', score: 5, demo: true },
];

const METHODS: Omit<InspectionMethod, 'id'>[] = [
  { name: '目视检查', instrument: '目视/放大镜', demo: true },
  { name: '卡尺测量', instrument: '游标卡尺 0-150mm', demo: true },
  { name: 'LCR 电桥测量', instrument: 'LCR 数字电桥', demo: true },
  { name: '晶闸管特性测试', instrument: '晶闸管综合测试台', demo: true },
  { name: '绝缘电阻测试', instrument: '2500V 兆欧表', demo: true },
  { name: '水压密封试验', instrument: '水压试验台', demo: true },
  { name: '光功率测量', instrument: '光源+光功率计', demo: true },
];

// ---------------- 演示批次（含 IQC/IPQC/OQC） ----------------

function buildDemoBatches(ctx: SeedCtx): Batch[] {
  const { rand, suppliers, customers, materials, standards } = ctx;
  const batches: Batch[] = [];
  const now = new Date();

  const plans: {
    matIdx: number; supIdx: number; qty: number; monthsAgo: number; day: number;
    defective: number; reviewed: boolean; kind?: 'IQC' | 'IPQC' | 'OQC'; custIdx?: number;
  }[] = [
    { matIdx: 0, supIdx: 0, qty: 1200, monthsAgo: 5, day: 6, defective: 0, reviewed: true },
    { matIdx: 0, supIdx: 1, qty: 800, monthsAgo: 4, day: 12, defective: 2, reviewed: true },
    { matIdx: 3, supIdx: 2, qty: 2400, monthsAgo: 4, day: 20, defective: 0, reviewed: true },
    { matIdx: 1, supIdx: 4, qty: 600, monthsAgo: 3, day: 8, defective: 0, reviewed: true },
    { matIdx: 4, supIdx: 2, qty: 1500, monthsAgo: 3, day: 15, defective: 1, reviewed: true },
    { matIdx: 2, supIdx: 3, qty: 300, monthsAgo: 2, day: 3, defective: 0, reviewed: true },
    { matIdx: 6, supIdx: 1, qty: 500, monthsAgo: 2, day: 18, defective: 3, reviewed: true },
    { matIdx: 8, supIdx: 4, qty: 2000, monthsAgo: 1, day: 5, defective: 0, reviewed: true },
    { matIdx: 10, supIdx: 4, qty: 900, monthsAgo: 1, day: 16, defective: 1, reviewed: true },
    { matIdx: 5, supIdx: 2, qty: 1000, monthsAgo: 0, day: 2, defective: 0, reviewed: true },
    { matIdx: 7, supIdx: 4, qty: 750, monthsAgo: 0, day: 5, defective: 0, reviewed: false },
    { matIdx: 9, supIdx: 3, qty: 400, monthsAgo: 0, day: 8, defective: 0, reviewed: false },
    // IPQC 与 OQC 演示批
    { matIdx: 0, supIdx: 0, qty: 60, monthsAgo: 1, day: 12, defective: 0, reviewed: true, kind: 'IPQC' },
    { matIdx: 3, supIdx: 2, qty: 80, monthsAgo: 0, day: 3, defective: 1, reviewed: true, kind: 'IPQC' },
    { matIdx: 0, supIdx: 0, qty: 200, monthsAgo: 0, day: 6, defective: 0, reviewed: true, kind: 'OQC', custIdx: 0 },
  ];

  let seq = 1;
  for (const p of plans) {
    const mat = materials[p.matIdx];
    const std = standards.find((s) => s.id === mat.standardId)!;
    const supplier = suppliers[p.supIdx];
    const kind = p.kind ?? 'IQC';
    const d = new Date(now.getFullYear(), now.getMonth() - p.monthsAgo, p.day, 9, 30);
    if (d > now) d.setMonth(d.getMonth() - 1);
    const iso = d.toISOString();
    const ymd = iso.slice(0, 10);
    const sampling = getSamplingPlan(p.qty, std.sampling.aql ?? 1.0);
    sampling.mode = 'aql';
    const isLast = seq === 12; // 第 12 条保持待检验
    const inspected = !isLast;

    const batch: Batch = {
      id: crypto.randomUUID(),
      batchNo: `${kind}-${mat.code}-${ymd.replace(/-/g, '')}-${String(seq).padStart(3, '0')}`,
      kind,
      componentTypeId: mat.id,
      componentTypeName: mat.name,
      materialId: mat.id,
      materialCode: mat.code,
      standardId: std.id,
      supplier: kind === 'OQC' ? '—' : supplier.name,
      supplierId: kind === 'OQC' ? undefined : supplier.id,
      supplierLotNo: kind === 'IQC' ? `LOT-${ymd.replace(/-/g, '')}-${Math.floor(rand() * 900 + 100)}` : undefined,
      quantity: p.qty,
      arrivalDate: ymd,
      poNo: kind === 'IQC' ? `PO-2026-${String(1000 + seq * 7)}` : undefined,
      project: seq % 2 === 0 ? '某特高压直流输电工程（演示）' : '某柔性直流输电工程（演示）',
      customerId: p.custIdx !== undefined ? customers[p.custIdx].id : undefined,
      customerName: p.custIdx !== undefined ? customers[p.custIdx].name : undefined,
      shipmentNo: kind === 'OQC' ? `SH-2026-${String(500 + seq)}` : undefined,
      line: kind === 'IPQC' ? '阀组件装配一线' : undefined,
      process: kind === 'IPQC' ? '晶闸管组件压装' : undefined,
      processInspType: kind === 'IPQC' ? '巡检' : undefined,
      status: 'pending_inspection',
      sampling,
      history: [{ at: iso, by: 'seed', byName: '系统演示数据', action: `${kind} 报检登记` }],
      createdBy: 'seed',
      createdByName: '系统演示数据',
      createdAt: iso,
      demo: true,
    };

    if (inspected) {
      const inspAt = new Date(d.getTime() + 26 * 3600 * 1000).toISOString();
      const items: InspectionItemResult[] = std.items.map((tpl, ti) => {
        const defects = ti === 1 ? p.defective : 0;
        if (tpl.kind === 'quantitative' && tpl.min !== undefined && tpl.max !== undefined) {
          const span = tpl.max - tpl.min;
          const values = Array.from({ length: Math.min(sampling.sampleSize, 5) }, () =>
            Number((tpl.min! + span * (0.25 + rand() * 0.5)).toFixed(4)),
          );
          return { templateId: tpl.id, name: tpl.name, kind: tpl.kind, unit: tpl.unit, min: tpl.min, max: tpl.max, values, defects, pass: defects === 0 };
        }
        return {
          templateId: tpl.id, name: tpl.name, kind: tpl.kind, unit: tpl.unit, min: tpl.min, max: tpl.max,
          qualitativePass: sampling.sampleSize - defects, defects, pass: defects === 0,
        };
      });
      const lotPass = p.defective <= sampling.ac;
      batch.inspection = {
        inspectorId: 'seed',
        inspectorName: '简检验（检验员）',
        inspectedAt: inspAt,
        items,
        defectiveCount: p.defective,
        lotPass,
        attachmentIds: [],
        note: '演示数据',
      };
      batch.status = 'pending_review';
      batch.history.push({
        at: inspAt, by: 'seed', byName: '简检验（检验员）',
        action: `检验完成：不合格品数 ${p.defective}（Ac=${sampling.ac}/Re=${sampling.re}），初判${lotPass ? '接收' : '拒收'}`,
      });

      if (p.reviewed) {
        const revAt = new Date(d.getTime() + 30 * 3600 * 1000).toISOString();
        const decision = lotPass ? 'accept' : rand() > 0.5 ? 'return' : 'sort';
        batch.review = {
          reviewerId: 'seed', reviewerName: '钱质量（质量工程师）', reviewedAt: revAt,
          decision: decision as 'accept' | 'return' | 'sort',
          note: lotPass ? undefined : '不合格品数达到拒收数，按 MRB 决议处置（演示）',
        };
        batch.status = lotPass ? 'accepted' : decision === 'return' ? 'rejected_return' : 'rejected_sort';
        batch.history.push({
          at: revAt, by: 'seed', byName: '钱质量（质量工程师）',
          action: lotPass ? '审核通过，合格接收' : `MRB 处置：${decision === 'return' ? '退货' : '全检挑选'}`,
        });
      }
    }

    batches.push(batch);
    seq += 1;
  }
  return batches;
}

// ---------------- 质量闭环演示（NCR→CAPA→客诉→成本） ----------------

async function seedQualityChain(ctx: SeedCtx, batches: Batch[]): Promise<void> {
  const rejected = batches.filter((b) => b.status === 'rejected_return' || b.status === 'rejected_sort');
  const nowIso = new Date().toISOString();
  let ncrSeq = 1;
  let capaSeq = 1;
  const year = new Date().getFullYear();

  for (const b of rejected) {
    const ncr: Ncr = {
      id: crypto.randomUUID(),
      no: `NCR-${year}-${String(ncrSeq++).padStart(4, '0')}`,
      source: b.kind ?? 'IQC',
      batchId: b.id,
      batchNo: b.batchNo,
      materialName: b.componentTypeName,
      supplier: b.supplier,
      supplierId: b.supplierId,
      qty: b.inspection?.defectiveCount ?? 1,
      defectDesc: (b.inspection?.items ?? []).filter((i) => !i.pass).map((i) => `${i.name}（不合格 ${i.defects} 件）`).join('；') || '批检验拒收',
      severity: 'Ma',
      status: ncrSeq === 2 ? 'closed' : 'processing',
      disposition: b.status === 'rejected_return' ? 'return' : 'sort',
      dispositionNote: '演示数据：按 MRB 决议处置，要求供方分析改进',
      cost: Math.round(2000 + ctx.rand() * 8000),
      costBearer: '供应商',
      shareWithSupplier: true,
      history: [{ at: b.createdAt, by: 'seed', byName: '系统演示数据', action: `由报检单 ${b.batchNo} 拒收自动登记` }],
      createdAt: b.createdAt,
      demo: true,
    };
    await putEntity('ncr-', ncr.id, ncr);
    await putEntity('cost-', crypto.randomUUID(), {
      id: crypto.randomUUID(),
      date: b.arrivalDate,
      typePath: '内部损失/不合格品处置',
      amount: ncr.cost ?? 0,
      refKind: 'ncr',
      refId: ncr.id,
      refNo: ncr.no,
      bearer: ncr.costBearer,
      note: `不合格品 ${ncr.no} 处置费用（演示）`,
      createdBy: '系统演示数据',
      demo: true,
    } satisfies QualityCost);

    // 第一条 NCR 发起 CAPA（8D 演示）
    if (capaSeq === 1) {
      const capa: Capa = {
        id: crypto.randomUUID(),
        no: `CAR-${year}-${String(capaSeq++).padStart(4, '0')}`,
        title: `不合格品整改：${ncr.materialName} ${ncr.defectDesc.slice(0, 30)}`,
        source: 'ncr',
        refId: ncr.id,
        refNo: ncr.no,
        owner: '钱质量（质量工程师）',
        supplierId: ncr.supplierId,
        supplierName: ncr.supplier,
        dueDate: nowIso.slice(0, 10),
        status: 'implementing',
        d1Team: '质量工程师、SQE、供应商质量代表（演示）',
        d2Problem: ncr.defectDesc,
        d3Containment: '隔离库存同批次产品，暂停该供应商同型号发货（演示）',
        d4RootCause: '供应商测试工装定位偏移导致参数漂移未被拦截（演示）',
        d5Corrective: '供应商更换定位工装并增加首件校验；来料加严检验一个周期（演示）',
        d6Implementation: '措施已在供应商端实施，加严检验执行中（演示）',
        history: [{ at: ncr.createdAt, by: 'seed', byName: '系统演示数据', action: `发起整改（来源：ncr ${ncr.no}）` }],
        createdAt: ncr.createdAt,
        demo: true,
      };
      await putEntity('capa-', capa.id, capa);
      ncr.carId = capa.id;
      await putEntity('ncr-', ncr.id, ncr);
    }
  }

  // 客诉演示（关联 CAPA）
  const complaint: Complaint = {
    id: crypto.randomUUID(),
    no: `CC-${year}-0001`,
    customerId: ctx.customers[0].id,
    customerName: ctx.customers[0].name,
    typePath: '产品质量/运行异常',
    severity: 'Ma',
    priority: '高',
    desc: '现场反馈某阀段监视系统报晶闸管级回报异常，请分析原因并提出处理意见（演示数据）',
    productInfo: '晶闸管级组件（演示）',
    owner: '钱质量（质量工程师）',
    status: 'processing',
    history: [
      { at: nowIso, by: 'seed', byName: '系统演示数据', action: '登记客户投诉' },
      { at: nowIso, by: 'seed', byName: '钱质量（质量工程师）', action: '处理记录', note: '已安排现场检查光纤链路与 TCU 板（演示）' },
    ],
    createdAt: nowIso,
    demo: true,
  };
  await putEntity('complaint-', complaint.id, complaint);
}

// ---------------- 评审 / 试验 / 量具 ----------------

async function seedSystemData(): Promise<void> {
  const nowIso = new Date().toISOString();
  const year = new Date().getFullYear();

  const checklist: AuditChecklist = {
    id: crypto.randomUUID(),
    name: '阀组件装配过程 LPA 分层审核表（演示）',
    kind: 'LPA分层审核',
    items: [
      { id: crypto.randomUUID(), text: '作业指导书为最新受控版本且操作者可随时查阅', weight: 2, mustPass: true },
      { id: crypto.randomUUID(), text: '压装力矩扳手在校准有效期内', weight: 3, mustPass: true },
      { id: crypto.randomUUID(), text: '晶闸管压接面清洁度符合工艺要求', weight: 3, mustPass: true },
      { id: crypto.randomUUID(), text: '现场物料标识与追溯卡填写完整', weight: 2, mustPass: false },
      { id: crypto.randomUUID(), text: '5S：工位整洁，无与生产无关物品', weight: 1, mustPass: false },
    ],
    demo: true,
  };
  await putEntity('checklist-', checklist.id, checklist);

  const audit: AuditRecord = {
    id: crypto.randomUUID(),
    no: `AUD-${year}-0001`,
    checklistId: checklist.id,
    checklistName: checklist.name,
    kind: 'LPA分层审核',
    target: '阀组件装配一线（演示）',
    auditor: '钱质量（质量工程师）',
    plannedDate: nowIso.slice(0, 10),
    status: 'done',
    scores: checklist.items.map((it, i) => ({ itemId: it.id, score: i === 3 ? 6 : 9, pass: true, note: i === 3 ? '个别追溯卡漏填班次（演示）' : undefined })),
    totalScore: 87.3,
    findings: [{ desc: '个别追溯卡漏填班次信息，需加强班组自查（演示）' }],
    history: [
      { at: nowIso, by: 'seed', byName: '系统演示数据', action: '创建评审计划' },
      { at: nowIso, by: 'seed', byName: '钱质量（质量工程师）', action: '评审完成，总分 87.3，发现 1 项' },
    ],
    createdAt: nowIso,
    demo: true,
  };
  await putEntity('audit-', audit.id, audit);

  const tpl: TestTemplate = {
    id: crypto.randomUUID(),
    name: 'RoHS 符合性验证模板（演示）',
    items: ['铅 Pb 含量', '镉 Cd 含量', '汞 Hg 含量', '六价铬 Cr6+ 含量', '多溴联苯 PBB', '多溴二苯醚 PBDE'],
    demo: true,
  };
  await putEntity('testtpl-', tpl.id, tpl);

  const test: PeriodicTest = {
    id: crypto.randomUUID(),
    no: `TST-${year}-0001`,
    name: '阻尼电容器 RoHS 年度验证（演示）',
    templateId: tpl.id,
    target: '阻尼电容器 / 桂林电容器供应商C',
    cycleDays: 365,
    nextDue: `${year}-12-31`,
    owner: '钱质量（质量工程师）',
    status: 'active',
    records: [{ date: `${year}-01-15`, result: 'pass', note: '第三方检测报告齐全（演示）', by: '钱质量（质量工程师）' }],
    demo: true,
  };
  await putEntity('test-', test.id, test);

  const gauges: Omit<Gauge, 'id'>[] = [
    { code: 'GA-001', name: '游标卡尺 0-150mm', type: '长度量具', calibCycleDays: 365, lastCalib: `${year}-01-10`, nextCalib: `${year + 1}-01-10`, location: 'IQC 检验室', history: [{ date: `${year}-01-10`, action: '校准合格', by: '计量室' }], demo: true },
    { code: 'GA-002', name: 'LCR 数字电桥', type: '电学仪器', calibCycleDays: 365, lastCalib: `${year}-03-01`, nextCalib: `${year + 1}-03-01`, location: 'IQC 检验室', history: [{ date: `${year}-03-01`, action: '校准合格', by: '计量室' }], demo: true },
    { code: 'GA-003', name: '2500V 兆欧表', type: '电学仪器', calibCycleDays: 180, lastCalib: `${year}-01-05`, nextCalib: `${year}-07-04`, location: '试验室', history: [{ date: `${year}-01-05`, action: '校准合格', by: '计量室' }], demo: true },
  ];
  for (const g of gauges) {
    const id = crypto.randomUUID();
    await putEntity('gauge-', id, { ...g, id });
  }
}

// ---------------- 主入口 ----------------

export async function ensureSeed(): Promise<void> {
  const us = usersStore();
  const flag = await us.get('__seeded__', { type: 'text' });
  if (flag === SEED_VERSION) return;

  // 清理自动化测试残留用户
  const userList = await us.list({ prefix: 'user-e2e_' });
  for (const b of userList.blobs) await us.delete(b.key);

  // 清理旧演示/测试业务数据（保留真实数据）
  const ds = dataStore();
  const prefixes = ['material-', 'partner-', 'unit-', 'defect-', 'method-', 'standard-', 'patrol-', 'ncr-', 'complaint-', 'capa-', 'issue-', 'checklist-', 'audit-', 'testtpl-', 'test-', 'gauge-', 'cost-', 'message-'];
  for (const prefix of prefixes) {
    const { blobs } = await ds.list({ prefix });
    for (const b of blobs) {
      const item = (await ds.get(b.key, { type: 'json' })) as { demo?: boolean } | null;
      const isE2e = item && JSON.stringify(item).includes('E2E');
      if (item?.demo || isE2e || prefix === 'message-') await ds.delete(b.key);
    }
  }
  const bs = batchStore();
  {
    const { blobs } = await bs.list({ prefix: 'batch-' });
    for (const b of blobs) {
      const old = (await bs.get(b.key, { type: 'json' })) as Batch | null;
      const isE2e = old && (old.batchNo.includes('E2E') || old.line === 'E2E产线' || JSON.stringify(old).includes('E2E'));
      if (old?.demo || isE2e || (old && TEST_SUPPLIERS.has(old.supplier))) await bs.delete(b.key);
    }
  }

  // 主数据
  const partners = buildPartners();
  for (const p of partners) await putEntity('partner-', p.id, p);
  const { standards, materials } = buildStandardsAndMaterials();
  for (const s of standards) await putEntity('standard-', s.id, s);
  for (const m of materials) await putEntity('material-', m.id, m);
  for (const u of UNITS) {
    const id = crypto.randomUUID();
    await putEntity('unit-', id, { ...u, id });
  }
  for (const d of DEFECTS) {
    const id = crypto.randomUUID();
    await putEntity('defect-', id, { ...d, id });
  }
  for (const m of METHODS) {
    const id = crypto.randomUUID();
    await putEntity('method-', id, { ...m, id });
  }

  // 用户（含供应商/客户演示账号）
  for (const d of DEMO_USERS) {
    const partner = d.partnerCode ? partners.find((p) => p.code === d.partnerCode) : undefined;
    const u: UserWithHash = {
      id: crypto.randomUUID(),
      username: d.username,
      name: d.name,
      role: d.role,
      userType: d.userType ?? 'internal',
      partnerId: partner?.id,
      active: true,
      createdAt: new Date().toISOString(),
      passwordHash: bcrypt.hashSync(d.password, 10),
    };
    await us.setJSON(`user-${d.username}`, u);
  }

  // 业务演示数据
  const ctx: SeedCtx = {
    rand: mulberry32(20260712),
    suppliers: partners.filter((p) => p.partnerKind === 'supplier'),
    customers: partners.filter((p) => p.partnerKind === 'customer'),
    materials,
    standards,
  };
  const batches = buildDemoBatches(ctx);
  for (const b of batches) await bs.setJSON(`batch-${b.id}`, b);
  await seedQualityChain(ctx, batches);
  await seedSystemData();

  await us.set('__seeded__', SEED_VERSION);
}

/** 兼容旧引用 */
export { buildDemoBatches };

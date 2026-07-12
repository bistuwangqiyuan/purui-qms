// 领域模型类型定义（前端与 Netlify Functions 共用）

export type Role = 'inspector' | 'qe' | 'admin';

export const ROLE_NAMES: Record<Role, string> = {
  inspector: '检验员',
  qe: '质量工程师',
  admin: '管理员',
};

export type UserType = 'internal' | 'supplier' | 'customer';

export const USER_TYPE_NAMES: Record<UserType, string> = {
  internal: '内部用户',
  supplier: '供应商用户',
  customer: '客户用户',
};

export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  /** 用户类型：内部 / 供应商 / 客户（默认内部） */
  userType?: UserType;
  /** 供应商/客户用户对应的合作方 ID */
  partnerId?: string;
  active: boolean;
  createdAt: string;
}

export interface UserWithHash extends User {
  passwordHash: string;
}

/** 检验项目模板 */
export interface InspectionItemTemplate {
  id: string;
  name: string;
  /** 检验方法（目视 / 卡尺测量 / 电桥测量 …） */
  method: string;
  /** 技术要求描述 */
  requirement: string;
  kind: 'quantitative' | 'qualitative';
  unit?: string;
  min?: number;
  max?: number;
  /** 依据（标准条款 / 规格书） */
  basis: string;
}

export type ComponentCategory = '关键件' | '重要件' | '一般件';

export interface ComponentType {
  id: string;
  code: string;
  name: string;
  category: ComponentCategory;
  /** 接收质量限（%），依据组部件类别选定 */
  aql: number;
  description: string;
  items: InspectionItemTemplate[];
}

export type SamplingMode = 'aql' | 'fixed' | 'percent';

/** 抽样方案（AQL 方式由 GB/T 2828.1-2012 一般检验水平 II、正常检验一次抽样解析而来） */
export interface SamplingPlan {
  /** 抽样方式（缺省为 aql，兼容历史数据） */
  mode?: SamplingMode;
  lotSize: number;
  aql: number;
  /** 样本量字码（按批量确定的原始字码） */
  codeLetter: string;
  /** 箭头解析后实际执行的字码 */
  effectiveLetter: string;
  sampleSize: number;
  ac: number;
  re: number;
  /** 样本量 >= 批量时执行全数检验 */
  fullInspection: boolean;
}

/** 单个检验项目的记录结果 */
export interface InspectionItemResult {
  templateId: string;
  name: string;
  kind: 'quantitative' | 'qualitative';
  unit?: string;
  min?: number;
  max?: number;
  /** 定量项：实测值列表（每个受检样本一个值）；定性项为空 */
  values?: number[];
  /** 定性项：合格样本数 */
  qualitativePass?: number;
  /** 该项目发现的不合格品数 */
  defects: number;
  pass: boolean;
  note?: string;
}

export interface InspectionRecord {
  inspectorId: string;
  inspectorName: string;
  inspectedAt: string;
  items: InspectionItemResult[];
  /** 全批不合格品数（各样本按“任一项目不合格即为不合格品”计数，由检验员汇总录入） */
  defectiveCount: number;
  /** 依据 Ac/Re 自动判定 */
  lotPass: boolean;
  attachmentIds: string[];
  note?: string;
}

export type BatchStatus =
  | 'pending_inspection' // 待检验
  | 'pending_review' // 待审核
  | 'accepted' // 合格接收
  | 'rejected_return' // 不合格退货
  | 'rejected_sort' // 不合格全检挑选
  | 'concession'; // 让步接收

export const STATUS_NAMES: Record<BatchStatus, string> = {
  pending_inspection: '待检验',
  pending_review: '待审核',
  accepted: '合格接收',
  rejected_return: '退货',
  rejected_sort: '全检挑选',
  concession: '让步接收',
};

export interface HistoryEntry {
  at: string;
  by: string;
  byName: string;
  action: string;
  note?: string;
}

/** 检验业务类别：来料 / 过程 / 出货 */
export type InspectionKind = 'IQC' | 'IPQC' | 'OQC';

export const KIND_NAMES: Record<InspectionKind, string> = {
  IQC: '来料检验',
  IPQC: '过程检验',
  OQC: '出货检验',
};

/** 过程检验类型 */
export type ProcessInspType = '首检' | '巡检' | '末检' | '生产自检';

export interface Batch {
  id: string;
  batchNo: string;
  /** 检验类别（缺省 IQC，兼容历史数据） */
  kind?: InspectionKind;
  componentTypeId: string;
  componentTypeName: string;
  /** 关联物料（阶段一后新登记批次填写） */
  materialId?: string;
  materialCode?: string;
  /** 关联检验标准 */
  standardId?: string;
  supplier: string;
  supplierId?: string;
  /** 供应商批号 / 生产批号 */
  supplierLotNo?: string;
  quantity: number;
  arrivalDate: string;
  poNo?: string;
  project?: string;
  /** OQC：客户与发货单号 */
  customerId?: string;
  customerName?: string;
  shipmentNo?: string;
  /** IPQC：产线 / 工序 / 检验类型 */
  line?: string;
  process?: string;
  processInspType?: ProcessInspType;
  /** 由巡检计划自动生成 */
  patrolPlanId?: string;
  /** 跳检说明（触发跳检规则时记录） */
  skipNote?: string;
  status: BatchStatus;
  sampling: SamplingPlan;
  inspection?: InspectionRecord;
  review?: {
    reviewerId: string;
    reviewerName: string;
    reviewedAt: string;
    decision: 'accept' | 'return' | 'sort' | 'concession' | 'reinspect';
    note?: string;
  };
  history: HistoryEntry[];
  createdBy: string;
  createdByName: string;
  createdAt: string;
  /** 演示数据标记 */
  demo?: boolean;
}

export interface BatchSummary {
  id: string;
  batchNo: string;
  kind?: InspectionKind;
  componentTypeId: string;
  componentTypeName: string;
  supplier: string;
  quantity: number;
  arrivalDate: string;
  status: BatchStatus;
  lotPass?: boolean;
  createdAt: string;
  demo?: boolean;
  customerName?: string;
  line?: string;
  process?: string;
  processInspType?: ProcessInspType;
}

export function toSummary(b: Batch): BatchSummary {
  return {
    id: b.id,
    batchNo: b.batchNo,
    kind: b.kind,
    componentTypeId: b.componentTypeId,
    componentTypeName: b.componentTypeName,
    supplier: b.supplier,
    quantity: b.quantity,
    arrivalDate: b.arrivalDate,
    status: b.status,
    lotPass: b.inspection?.lotPass,
    createdAt: b.createdAt,
    demo: b.demo,
    customerName: b.customerName,
    line: b.line,
    process: b.process,
    processInspType: b.processInspType,
  };
}

// ============================================================
// 主数据（阶段一）
// ============================================================

export interface Unit {
  id: string;
  name: string;
  symbol: string;
}

export interface Material {
  id: string;
  code: string;
  name: string;
  /** 树状分类路径，如"换流阀组部件/有源器件" */
  categoryPath: string;
  unit: string;
  spec?: string;
  /** 绑定的检验标准 */
  standardId?: string;
  /** 供应商料号对应关系 */
  supplierRefs?: { supplierId: string; supplierCode: string }[];
  active: boolean;
  demo?: boolean;
}

export interface Partner {
  id: string;
  code: string;
  name: string;
  /** supplier / customer */
  partnerKind: 'supplier' | 'customer';
  type?: string;
  contact?: string;
  phone?: string;
  email?: string;
  address?: string;
  active: boolean;
  demo?: boolean;
}

export type DefectSeverity = 'Cr' | 'Ma' | 'Mi';

export const SEVERITY_NAMES: Record<DefectSeverity, string> = {
  Cr: '致命缺陷 Cr',
  Ma: '严重缺陷 Ma',
  Mi: '轻微缺陷 Mi',
};

export interface DefectCode {
  id: string;
  code: string;
  name: string;
  severity: DefectSeverity;
  /** 严重度扣分（Cr=10 / Ma=5 / Mi=1 常用） */
  score: number;
  demo?: boolean;
}

export interface InspectionMethod {
  id: string;
  name: string;
  instrument?: string;
  demo?: boolean;
}

/** 检验标准条目（电子化物料检验标准） */
export interface StandardItem {
  id: string;
  name: string;
  method: string;
  requirement: string;
  kind: 'quantitative' | 'qualitative';
  unit?: string;
  min?: number;
  max?: number;
  /** 预警值（在公差内、接近公差限） */
  warnMin?: number;
  warnMax?: number;
  /** 特殊特性标记 */
  special?: boolean;
  defectCodeId?: string;
  basis: string;
}

/** 跳检规则（依据 GB/T 2828.1-2012 转移规则思想简化：连续 N 批接收后放宽） */
export interface SkipRule {
  enabled: boolean;
  /** 连续接收批数阈值 */
  consecutivePass: number;
  /** 触发后每 skipOneOf 批跳检 1 批 */
  skipOneOf: number;
}

export interface SamplingConfig {
  mode: SamplingMode;
  /** AQL 方式 */
  aql?: number;
  /** 固定数量方式 */
  fixedN?: number;
  fixedAc?: number;
  /** 百分比方式（0-100） */
  percent?: number;
  percentAc?: number;
}

export interface InspectionStandard {
  id: string;
  code: string;
  name: string;
  description?: string;
  sampling: SamplingConfig;
  items: StandardItem[];
  skipRule?: SkipRule;
  /** 合格批是否自动批准（免审批） */
  autoApprovePass?: boolean;
  active: boolean;
  demo?: boolean;
}

// ============================================================
// 巡检计划（阶段二）
// ============================================================

export interface PatrolPlan {
  id: string;
  name: string;
  line: string;
  process: string;
  /** 巡检间隔（小时） */
  intervalHours: number;
  materialId?: string;
  materialName?: string;
  standardId: string;
  owner?: string;
  active: boolean;
  /** 上次生成任务时间 */
  lastGeneratedAt?: string;
  demo?: boolean;
}

// ============================================================
// 不合格品 / 客诉 / CAPA / 问题（阶段三）
// ============================================================

export type NcrStatus = 'open' | 'processing' | 'closed';

export const NCR_STATUS_NAMES: Record<NcrStatus, string> = {
  open: '待处理',
  processing: '处理中',
  closed: '已关闭',
};

export type NcrDisposition = 'return' | 'rework' | 'sort' | 'concession' | 'scrap';

export const DISPOSITION_NAMES: Record<NcrDisposition, string> = {
  return: '退货',
  rework: '返修',
  sort: '全检挑选',
  concession: '让步接收',
  scrap: '报废',
};

export interface Ncr {
  id: string;
  no: string;
  source: 'IQC' | 'IPQC' | 'OQC' | 'complaint' | 'manual';
  /** 关联报检单 */
  batchId?: string;
  batchNo?: string;
  materialName: string;
  supplier?: string;
  supplierId?: string;
  qty: number;
  defectDesc: string;
  defectCodeId?: string;
  severity?: DefectSeverity;
  status: NcrStatus;
  disposition?: NcrDisposition;
  dispositionNote?: string;
  /** 质量成本（元） */
  cost?: number;
  costBearer?: string;
  /** 是否公开给供应商 */
  shareWithSupplier?: boolean;
  carId?: string;
  owner?: string;
  history: HistoryEntry[];
  createdAt: string;
  demo?: boolean;
}

export type ComplaintStatus = 'open' | 'processing' | 'closed';

export interface Complaint {
  id: string;
  no: string;
  customerId?: string;
  customerName: string;
  typePath: string;
  severity: DefectSeverity;
  priority: '高' | '中' | '低';
  desc: string;
  productInfo?: string;
  owner?: string;
  status: ComplaintStatus;
  ncrId?: string;
  carId?: string;
  cost?: number;
  history: HistoryEntry[];
  createdAt: string;
  demo?: boolean;
}

export type CapaStatus = 'open' | 'analyzing' | 'implementing' | 'verifying' | 'closed';

export const CAPA_STATUS_NAMES: Record<CapaStatus, string> = {
  open: '已发起',
  analyzing: '原因分析',
  implementing: '措施实施',
  verifying: '效果验证',
  closed: '已关闭',
};

/** CAPA（CAR/SCAR 整改单，含 8D 结构化字段） */
export interface Capa {
  id: string;
  no: string;
  title: string;
  source: 'ncr' | 'complaint' | 'issue' | 'audit' | 'manual';
  refId?: string;
  refNo?: string;
  owner: string;
  supplierId?: string;
  supplierName?: string;
  dueDate?: string;
  status: CapaStatus;
  /** 8D 结构化内容 */
  d1Team?: string;
  d2Problem?: string;
  d3Containment?: string;
  d4RootCause?: string;
  d5Corrective?: string;
  d6Implementation?: string;
  d7Prevention?: string;
  d8Closure?: string;
  history: HistoryEntry[];
  createdAt: string;
  demo?: boolean;
}

export interface Issue {
  id: string;
  no: string;
  typePath: string;
  source: 'audit' | 'lpa' | 'manual';
  refId?: string;
  desc: string;
  owner?: string;
  status: 'open' | 'processing' | 'closed';
  carId?: string;
  history: HistoryEntry[];
  createdAt: string;
  demo?: boolean;
}

// ============================================================
// 评审 / 试验 / 量具 / 成本（阶段四）
// ============================================================

export type AuditKind = '过程审核' | '产品审核' | '体系审核' | '5S' | 'LPA分层审核';

export interface AuditChecklist {
  id: string;
  name: string;
  kind: AuditKind;
  items: { id: string; text: string; weight: number; mustPass: boolean }[];
  demo?: boolean;
}

export interface AuditRecord {
  id: string;
  no: string;
  checklistId: string;
  checklistName: string;
  kind: AuditKind;
  /** 评审对象：供应商 / 车间 / 过程 / 样品等 */
  target: string;
  auditor: string;
  plannedDate: string;
  status: 'planned' | 'in_progress' | 'done';
  /** 每条目 0-10 评分 */
  scores?: { itemId: string; score: number; pass: boolean; note?: string }[];
  /** 加权总分（0-100） */
  totalScore?: number;
  findings?: { desc: string; issueId?: string }[];
  history: HistoryEntry[];
  createdAt: string;
  demo?: boolean;
}

export interface TestTemplate {
  id: string;
  name: string;
  items: string[];
  demo?: boolean;
}

export interface PeriodicTest {
  id: string;
  no: string;
  name: string;
  templateId?: string;
  /** 试验对象（物料/供应商/产品） */
  target: string;
  /** 周期（天） */
  cycleDays: number;
  nextDue: string;
  owner?: string;
  status: 'active' | 'paused';
  records: { date: string; result: 'pass' | 'fail'; note?: string; attachmentId?: string; by: string }[];
  demo?: boolean;
}

export interface Gauge {
  id: string;
  code: string;
  name: string;
  type: string;
  /** 校准周期（天） */
  calibCycleDays: number;
  lastCalib?: string;
  nextCalib?: string;
  location?: string;
  history: { date: string; action: string; by: string; note?: string }[];
  demo?: boolean;
}

export interface QualityCost {
  id: string;
  date: string;
  /** 费用类型树路径，如"内部损失/返工" */
  typePath: string;
  amount: number;
  refKind?: 'ncr' | 'complaint' | 'other';
  refId?: string;
  refNo?: string;
  bearer?: string;
  note?: string;
  createdBy: string;
  demo?: boolean;
}

// ============================================================
// 消息 / 任务（阶段四）
// ============================================================

export type MessageKind = 'warning' | 'task' | 'approval' | 'info';

export interface Message {
  id: string;
  /** 收件：指定用户 ID 或角色 */
  toUserId?: string;
  toRole?: Role;
  title: string;
  body: string;
  kind: MessageKind;
  /** 前端跳转链接 */
  link?: string;
  read: boolean;
  createdAt: string;
}

/** 聚合任务（由各模块动态汇总，不落库） */
export interface TaskItem {
  kind: '待检验' | '待审核' | '整改' | '评审' | '试验' | '校准' | '客诉' | '不合格品';
  title: string;
  link: string;
  due?: string;
  overdue?: boolean;
}

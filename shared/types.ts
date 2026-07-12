// 领域模型类型定义（前端与 Netlify Functions 共用）

export type Role = 'inspector' | 'qe' | 'admin';

export const ROLE_NAMES: Record<Role, string> = {
  inspector: '检验员',
  qe: '质量工程师',
  admin: '管理员',
};

export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
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

/** 抽样方案（由 GB/T 2828.1-2012 一般检验水平 II、正常检验一次抽样解析而来） */
export interface SamplingPlan {
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

export interface Batch {
  id: string;
  batchNo: string;
  componentTypeId: string;
  componentTypeName: string;
  supplier: string;
  /** 供应商批号 / 生产批号 */
  supplierLotNo?: string;
  quantity: number;
  arrivalDate: string;
  poNo?: string;
  project?: string;
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
  componentTypeId: string;
  componentTypeName: string;
  supplier: string;
  quantity: number;
  arrivalDate: string;
  status: BatchStatus;
  lotPass?: boolean;
  createdAt: string;
  demo?: boolean;
}

export function toSummary(b: Batch): BatchSummary {
  return {
    id: b.id,
    batchNo: b.batchNo,
    componentTypeId: b.componentTypeId,
    componentTypeName: b.componentTypeName,
    supplier: b.supplier,
    quantity: b.quantity,
    arrivalDate: b.arrivalDate,
    status: b.status,
    lotPass: b.inspection?.lotPass,
    createdAt: b.createdAt,
    demo: b.demo,
  };
}

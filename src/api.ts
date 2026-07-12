import type {
  AuditChecklist,
  AuditRecord,
  Batch,
  BatchSummary,
  Capa,
  Complaint,
  ComponentType,
  DefectCode,
  Gauge,
  InspectionItemResult,
  InspectionMethod,
  InspectionStandard,
  Issue,
  Material,
  Message,
  Ncr,
  Partner,
  PatrolPlan,
  PeriodicTest,
  QualityCost,
  SamplingPlan,
  TaskItem,
  TestTemplate,
  Unit,
  User,
} from '../shared/types';

const TOKEN_KEY = 'qms_token';
const USER_KEY = 'qms_user';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function getStoredUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as User) : null;
}
export function storeSession(token: string, user: User): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(init?.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (res.status === 401 && path !== '/login') {
    clearSession();
    window.location.href = '/login';
    throw new ApiError(401, '登录已过期');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? `请求失败（${res.status}）`);
  }
  return (await res.json()) as T;
}

const get = <T>(p: string) => request<T>(p);
const post = <T>(p: string, body?: unknown) =>
  request<T>(p, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined });
const put = <T>(p: string, body: unknown) => request<T>(p, { method: 'PUT', body: JSON.stringify(body) });
const patch = <T>(p: string, body: unknown) => request<T>(p, { method: 'PATCH', body: JSON.stringify(body) });
const del = <T>(p: string) => request<T>(p, { method: 'DELETE' });

export interface Stats {
  totalBatches: number;
  pendingInspection: number;
  pendingReview: number;
  inspectedLots: number;
  passedLots: number;
  byStatus: Record<string, number>;
  bySupplier: Record<string, { total: number; passed: number }>;
  byComponent: Record<string, { total: number; passed: number }>;
  byMonth: Record<string, { total: number; passed: number }>;
  byKind: Record<string, { total: number; passed: number }>;
  defectPareto: { name: string; count: number }[];
  ppm: number;
  openNcrs: number;
  openComplaints: number;
  openCapas: number;
  costTotal: number;
  costByType: Record<string, number>;
}

export interface TraceResult {
  batches: { id: string; batchNo: string; kind: string; name: string; supplier: string; status: string; date: string; lotPass?: boolean }[];
  ncrs: { id: string; no: string; name: string; status: string; batchNo?: string; createdAt: string }[];
  complaints: { id: string; no: string; customer: string; status: string; createdAt: string }[];
  capas: { id: string; no: string; title: string; status: string; refNo?: string; createdAt: string }[];
  costs: { id: string; date: string; typePath: string; amount: number; refNo?: string }[];
}

export interface SpcSeries {
  itemName: string;
  unit?: string;
  lsl?: number;
  usl?: number;
  groups: { batchNo: string; date: string; values: number[] }[];
}

export const api = {
  // ---- 会话 ----
  login: (username: string, password: string) =>
    post<{ token: string; user: User }>('/login', { username, password }),

  // ---- 主数据 ----
  componentTypes: () => get<ComponentType[]>('/component-types'),
  materials: () => get<Material[]>('/materials'),
  saveMaterial: (m: Partial<Material>) => (m.id ? put<Material>(`/materials/${m.id}`, m) : post<Material>('/materials', m)),
  deleteMaterial: (id: string) => del(`/materials/${id}`),
  partners: () => get<Partner[]>('/partners'),
  savePartner: (p: Partial<Partner>) => (p.id ? put<Partner>(`/partners/${p.id}`, p) : post<Partner>('/partners', p)),
  deletePartner: (id: string) => del(`/partners/${id}`),
  units: () => get<Unit[]>('/unit-list'),
  saveUnit: (u: Partial<Unit>) => (u.id ? put<Unit>(`/unit-list/${u.id}`, u) : post<Unit>('/unit-list', u)),
  defects: () => get<DefectCode[]>('/defects'),
  saveDefect: (d: Partial<DefectCode>) => (d.id ? put<DefectCode>(`/defects/${d.id}`, d) : post<DefectCode>('/defects', d)),
  methods: () => get<InspectionMethod[]>('/methods'),
  saveMethod: (m: Partial<InspectionMethod>) => (m.id ? put<InspectionMethod>(`/methods/${m.id}`, m) : post<InspectionMethod>('/methods', m)),
  standards: () => get<InspectionStandard[]>('/standards'),
  saveStandard: (s: Partial<InspectionStandard>) =>
    s.id ? put<InspectionStandard>(`/standards/${s.id}`, s) : post<InspectionStandard>('/standards', s),
  importCsv: (kind: 'materials' | 'suppliers' | 'customers', csv: string) =>
    post<{ created: number; errors: string[] }>(`/import/${kind}`, { csv }),
  samplingPreview: (params: Record<string, string | number>) => {
    const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    return get<SamplingPlan>(`/sampling-preview?${qs}`);
  },

  // ---- 检验业务 ----
  batches: (opts?: { status?: string; kind?: string }) => {
    const qs = new URLSearchParams();
    if (opts?.status) qs.set('status', opts.status);
    if (opts?.kind) qs.set('kind', opts.kind);
    const s = qs.toString();
    return get<BatchSummary[]>(`/batches${s ? `?${s}` : ''}`);
  },
  batch: (id: string) => get<Batch>(`/batches/${id}`),
  createBatch: (data: Record<string, unknown>) => post<Batch>('/batches', data),
  submitInspection: (
    id: string,
    data: { items: InspectionItemResult[]; defectiveCount: number; attachmentIds?: string[]; note?: string },
  ) => post<Batch>(`/batches/${id}/inspection`, data),
  review: (id: string, decision: string, note?: string) => post<Batch>(`/batches/${id}/review`, { decision, note }),
  patrolPlans: () => get<PatrolPlan[]>('/patrol-plans'),
  savePatrolPlan: (p: Partial<PatrolPlan>) =>
    p.id ? put<PatrolPlan>(`/patrol-plans/${p.id}`, p) : post<PatrolPlan>('/patrol-plans', p),
  generatePatrol: () => post<{ generated: string[] }>('/patrol-plans/generate'),
  uploadAttachment: async (file: File): Promise<string> => {
    const dataBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const r = await post<{ id: string }>('/attachments', { name: file.name, contentType: file.type, dataBase64 });
    return r.id;
  },
  attachmentUrl: (id: string) => `/api/attachments/${id}`,

  // ---- 质量改进 ----
  ncrs: () => get<Ncr[]>('/ncrs'),
  ncr: (id: string) => get<Ncr>(`/ncrs/${id}`),
  createNcr: (n: Partial<Ncr>) => post<Ncr>('/ncrs', n),
  ncrDisposition: (id: string, data: Record<string, unknown>) => post<Ncr>(`/ncrs/${id}/disposition`, data),
  complaints: () => get<Complaint[]>('/complaints'),
  complaint: (id: string) => get<Complaint>(`/complaints/${id}`),
  createComplaint: (c: Partial<Complaint>) => post<Complaint>('/complaints', c),
  complaintAction: (id: string, data: Record<string, unknown>) => post<Complaint>(`/complaints/${id}/action`, data),
  capas: () => get<Capa[]>('/capas'),
  capa: (id: string) => get<Capa>(`/capas/${id}`),
  createCapa: (c: Partial<Capa>) => post<Capa>('/capas', c),
  updateCapa: (id: string, c: Partial<Capa> & { statusNote?: string }) => put<Capa>(`/capas/${id}`, c),
  issues: () => get<Issue[]>('/issues'),
  createIssue: (i: Partial<Issue>) => post<Issue>('/issues', i),
  issueAction: (id: string, data: Record<string, unknown>) => post<Issue>(`/issues/${id}/action`, data),

  // ---- 体系管理 ----
  auditChecklists: () => get<AuditChecklist[]>('/audit-checklists'),
  createChecklist: (c: Partial<AuditChecklist>) => post<AuditChecklist>('/audit-checklists', c),
  audits: () => get<AuditRecord[]>('/audits'),
  audit: (id: string) => get<AuditRecord>(`/audits/${id}`),
  createAudit: (a: Partial<AuditRecord>) => post<AuditRecord>('/audits', a),
  executeAudit: (id: string, data: Record<string, unknown>) => post<AuditRecord>(`/audits/${id}/execute`, data),
  auditStartCapa: (id: string, desc: string) => post<Capa>(`/audits/${id}/start-capa`, { desc }),
  testTemplates: () => get<TestTemplate[]>('/test-templates'),
  createTestTemplate: (t: Partial<TestTemplate>) => post<TestTemplate>('/test-templates', t),
  tests: () => get<PeriodicTest[]>('/tests'),
  createTest: (t: Partial<PeriodicTest>) => post<PeriodicTest>('/tests', t),
  executeTest: (id: string, data: Record<string, unknown>) => post<PeriodicTest>(`/tests/${id}/execute`, data),
  updateTest: (id: string, t: Partial<PeriodicTest>) => put<PeriodicTest>(`/tests/${id}`, t),
  gauges: () => get<Gauge[]>('/gauges'),
  createGauge: (g: Partial<Gauge>) => post<Gauge>('/gauges', g),
  calibrateGauge: (id: string, data: { date?: string; note?: string }) => post<Gauge>(`/gauges/${id}/calibrate`, data),
  costs: () => get<QualityCost[]>('/costs'),
  createCost: (c: Partial<QualityCost>) => post<QualityCost>('/costs', c),

  // ---- 协同与分析 ----
  messages: () => get<Message[]>('/messages'),
  readMessage: (id: string) => post<Message>(`/messages/${id}/read`),
  tasks: () => get<TaskItem[]>('/tasks'),
  trace: (q: string) => get<TraceResult>(`/trace?q=${encodeURIComponent(q)}`),
  stats: () => get<Stats>('/stats'),
  spcSeries: (typeId: string, itemId: string) =>
    get<SpcSeries>(`/spc/series?typeId=${encodeURIComponent(typeId)}&itemId=${encodeURIComponent(itemId)}`),

  // ---- 用户 ----
  users: () => get<User[]>('/users'),
  createUser: (data: Record<string, unknown>) => post<User>('/users', data),
  updateUser: (username: string, data: { active?: boolean; password?: string }) => patch<User>(`/users/${username}`, data),
};

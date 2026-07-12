import type {
  Batch,
  BatchSummary,
  ComponentType,
  InspectionItemResult,
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

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; user: User }>('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  componentTypes: () => request<ComponentType[]>('/component-types'),
  batches: (status?: string) =>
    request<BatchSummary[]>(`/batches${status ? `?status=${status}` : ''}`),
  batch: (id: string) => request<Batch>(`/batches/${id}`),
  createBatch: (data: {
    componentTypeId: string;
    supplier: string;
    supplierLotNo?: string;
    quantity: number;
    arrivalDate: string;
    poNo?: string;
    project?: string;
  }) => request<Batch>('/batches', { method: 'POST', body: JSON.stringify(data) }),
  submitInspection: (
    id: string,
    data: { items: InspectionItemResult[]; defectiveCount: number; attachmentIds?: string[]; note?: string },
  ) => request<Batch>(`/batches/${id}/inspection`, { method: 'POST', body: JSON.stringify(data) }),
  review: (id: string, decision: string, note?: string) =>
    request<Batch>(`/batches/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, note }),
    }),
  uploadAttachment: async (file: File): Promise<string> => {
    const dataBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const r = await request<{ id: string }>('/attachments', {
      method: 'POST',
      body: JSON.stringify({ name: file.name, contentType: file.type, dataBase64 }),
    });
    return r.id;
  },
  attachmentUrl: (id: string) => `/api/attachments/${id}`,
  stats: () =>
    request<{
      totalBatches: number;
      pendingInspection: number;
      pendingReview: number;
      inspectedLots: number;
      passedLots: number;
      byStatus: Record<string, number>;
      bySupplier: Record<string, { total: number; passed: number }>;
      byComponent: Record<string, { total: number; passed: number }>;
      byMonth: Record<string, { total: number; passed: number }>;
    }>('/stats'),
  users: () => request<User[]>('/users'),
  createUser: (data: { username: string; name: string; role: string; password: string }) =>
    request<User>('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (username: string, data: { active?: boolean; password?: string }) =>
    request<User>(`/users/${username}`, { method: 'PATCH', body: JSON.stringify(data) }),
};

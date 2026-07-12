/**
 * Functions 公共库：存储、响应、鉴权、路由类型、消息通知
 */
import { getStore } from '@netlify/blobs';
import { SignJWT, jwtVerify } from 'jose';
import type { Message, Role, User, UserType } from '../../shared/types';

// ---------------- 存储 ----------------

export const usersStore = () => getStore({ name: 'qms-users', consistency: 'strong' });
export const batchStore = () => getStore({ name: 'qms-batches', consistency: 'strong' });
export const fileStore = () => getStore({ name: 'qms-attachments', consistency: 'strong' });
/** 其余业务实体统一存储，按 key 前缀区分（material- / ncr- / capa- ...） */
export const dataStore = () => getStore({ name: 'qms-data', consistency: 'strong' });

/** 按前缀取全部实体 */
export async function listByPrefix<T>(prefix: string): Promise<T[]> {
  const ds = dataStore();
  const { blobs } = await ds.list({ prefix });
  const items = await Promise.all(blobs.map((b) => ds.get(b.key, { type: 'json' }) as Promise<T>));
  return items.filter(Boolean);
}

export async function getEntity<T>(prefix: string, id: string): Promise<T | null> {
  return (await dataStore().get(`${prefix}${id}`, { type: 'json' })) as T | null;
}

export async function putEntity(prefix: string, id: string, value: unknown): Promise<void> {
  await dataStore().setJSON(`${prefix}${id}`, value);
}

export async function deleteEntity(prefix: string, id: string): Promise<void> {
  await dataStore().delete(`${prefix}${id}`);
}

/** 业务单号：前缀-年份-序号 */
export function nextNo(prefix: string, existingCount: number): string {
  return `${prefix}-${new Date().getFullYear()}-${String(existingCount + 1).padStart(4, '0')}`;
}

// ---------------- 响应 ----------------

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export function fail(status: number, message: string): Response {
  return json({ error: message }, status);
}

// ---------------- 鉴权 ----------------

const enc = new TextEncoder();
export function jwtSecret(): Uint8Array {
  const s = process.env.JWT_SECRET || 'purui-qms-demo-secret-change-me-in-production';
  return enc.encode(s);
}

export interface AuthInfo {
  userId: string;
  username: string;
  name: string;
  role: Role;
  userType: UserType;
  partnerId?: string;
}

export async function signToken(user: User): Promise<string> {
  return await new SignJWT({
    role: user.role,
    name: user.name,
    username: user.username,
    userType: user.userType ?? 'internal',
    partnerId: user.partnerId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(jwtSecret());
}

export async function authenticate(req: Request): Promise<AuthInfo | null> {
  const header = req.headers.get('authorization') || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    const { payload } = await jwtVerify(m[1], jwtSecret());
    return {
      userId: String(payload.sub),
      username: String(payload.username),
      name: String(payload.name),
      role: payload.role as Role,
      userType: (payload.userType as UserType) ?? 'internal',
      partnerId: payload.partnerId as string | undefined,
    };
  } catch {
    return null;
  }
}

export function isInternal(auth: AuthInfo): boolean {
  return auth.userType === 'internal';
}

// ---------------- 站内消息 ----------------

export async function notify(msg: Omit<Message, 'id' | 'read' | 'createdAt'>): Promise<void> {
  const m: Message = {
    ...msg,
    id: crypto.randomUUID(),
    read: false,
    createdAt: new Date().toISOString(),
  };
  await putEntity('message-', m.id, m);
}

// ---------------- 路由 ----------------

export interface RouteCtx {
  req: Request;
  url: URL;
  auth: AuthInfo;
  match: RegExpMatchArray;
}

export interface Route {
  method: string;
  pattern: RegExp;
  /** 允许的内部角色（不设则任意登录用户，含供方/客户） */
  roles?: Role[];
  /** 是否仅限内部用户（默认 true；设 false 允许供方/客户访问） */
  internalOnly?: boolean;
  handler: (ctx: RouteCtx) => Promise<Response>;
}

export async function dispatch(
  routes: Route[],
  method: string,
  path: string,
  req: Request,
  url: URL,
  auth: AuthInfo,
): Promise<Response | null> {
  for (const r of routes) {
    if (r.method !== method) continue;
    const match = path.match(r.pattern);
    if (!match) continue;
    if (r.internalOnly !== false && auth.userType !== 'internal') {
      return fail(403, '该功能仅限内部用户使用');
    }
    if (r.roles && !r.roles.includes(auth.role) && auth.userType === 'internal') {
      return fail(403, '当前角色无权执行此操作');
    }
    return await r.handler({ req, url, auth, match });
  }
  return null;
}

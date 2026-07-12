/**
 * 普瑞QMS 后端 API（Netlify Functions v2 + Netlify Blobs）
 * 单入口 /api/*，按域拆分路由模块（masterdata / inspection / quality / system / collab）
 */
import type { Config, Context } from '@netlify/functions';
import bcrypt from 'bcryptjs';
import type { Role, UserType, UserWithHash } from '../../shared/types';
import { COMPONENT_TYPES } from '../../shared/masterdata';
import type { Route } from './lib';
import {
  authenticate,
  dispatch,
  fail,
  fileStore,
  json,
  signToken,
  usersStore,
} from './lib';
import { ensureSeed } from './seed-data';
import { masterdataRoutes } from './routes/masterdata';
import { inspectionRoutes } from './routes/inspection';
import { qualityRoutes } from './routes/quality';
import { systemRoutes } from './routes/system';
import { collabRoutes } from './routes/collab';

export const config: Config = { path: '/api/*' };

// ---------------- 用户管理路由 ----------------

const userRoutes: Route[] = [
  {
    method: 'GET',
    pattern: /^\/me$/,
    internalOnly: false,
    handler: async ({ auth }) => json(auth),
  },
  {
    method: 'GET',
    pattern: /^\/users$/,
    roles: ['admin'],
    handler: async () => {
      const us = usersStore();
      const { blobs } = await us.list({ prefix: 'user-' });
      const users = await Promise.all(
        blobs.map((b) => us.get(b.key, { type: 'json' }) as Promise<UserWithHash>),
      );
      return json(users.filter(Boolean).map(({ passwordHash: _ph, ...u }) => u));
    },
  },
  {
    method: 'POST',
    pattern: /^\/users$/,
    roles: ['admin'],
    handler: async ({ req }) => {
      const body = (await req.json()) as {
        username?: string;
        name?: string;
        role?: Role;
        password?: string;
        userType?: UserType;
        partnerId?: string;
      };
      const username = body.username?.trim();
      if (!username || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        return fail(400, '用户名须为 3–20 位字母、数字或下划线');
      }
      if (!body.name?.trim()) return fail(400, '请填写姓名');
      if (!body.password || body.password.length < 8) return fail(400, '密码至少 8 位');
      if (!['inspector', 'qe', 'admin'].includes(body.role ?? '')) return fail(400, '角色无效');
      const userType = body.userType ?? 'internal';
      if (!['internal', 'supplier', 'customer'].includes(userType)) return fail(400, '用户类型无效');
      if (userType !== 'internal' && !body.partnerId) {
        return fail(400, '供应商/客户用户须关联合作方（先在基础数据中建立供应商/客户）');
      }
      const us = usersStore();
      if (await us.get(`user-${username}`)) return fail(409, '用户名已存在');
      const u: UserWithHash = {
        id: crypto.randomUUID(),
        username,
        name: body.name.trim(),
        role: userType === 'internal' ? (body.role as Role) : 'inspector',
        userType,
        partnerId: userType !== 'internal' ? body.partnerId : undefined,
        active: true,
        createdAt: new Date().toISOString(),
        passwordHash: bcrypt.hashSync(body.password, 10),
      };
      await us.setJSON(`user-${username}`, u);
      const { passwordHash: _ph, ...pub } = u;
      return json(pub, 201);
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/users\/([a-zA-Z0-9_]+)$/,
    roles: ['admin'],
    handler: async ({ req, match }) => {
      const us = usersStore();
      const u = (await us.get(`user-${match[1]}`, { type: 'json' })) as UserWithHash | null;
      if (!u) return fail(404, '用户不存在');
      const body = (await req.json()) as { active?: boolean; password?: string };
      if (typeof body.active === 'boolean') {
        if (u.username === 'admin' && !body.active) return fail(400, '不能停用内置管理员');
        u.active = body.active;
      }
      if (body.password) {
        if (body.password.length < 8) return fail(400, '密码至少 8 位');
        u.passwordHash = bcrypt.hashSync(body.password, 10);
      }
      await us.setJSON(`user-${u.username}`, u);
      const { passwordHash: _ph, ...pub } = u;
      return json(pub);
    },
  },
];

const allRoutes: Route[] = [
  ...userRoutes,
  ...masterdataRoutes,
  ...inspectionRoutes,
  ...qualityRoutes,
  ...systemRoutes,
  ...collabRoutes,
];

export default async function handler(req: Request, _context: Context): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, '') || '/';
  const method = req.method.toUpperCase();

  try {
    await ensureSeed();

    // ---------- 公开路由 ----------
    if (path === '/login' && method === 'POST') {
      const body = (await req.json()) as { username?: string; password?: string };
      if (!body.username || !body.password) return fail(400, '请输入用户名与密码');
      const u = (await usersStore().get(`user-${body.username.trim()}`, { type: 'json' })) as UserWithHash | null;
      if (!u || !u.active || !bcrypt.compareSync(body.password, u.passwordHash)) {
        return fail(401, '用户名或密码错误');
      }
      const { passwordHash: _ph, ...user } = u;
      const token = await signToken(user);
      return json({ token, user });
    }

    if (path === '/component-types' && method === 'GET') {
      return json(COMPONENT_TYPES);
    }

    // 附件读取（供 <img> 直接引用，UUID 即访问凭据）
    const attGet = path.match(/^\/attachments\/([0-9a-f-]+)$/);
    if (attGet && method === 'GET') {
      const meta = await fileStore().getWithMetadata(attGet[1], { type: 'arrayBuffer' });
      if (!meta) return fail(404, '附件不存在');
      return new Response(meta.data, {
        headers: {
          'content-type': String(meta.metadata?.contentType ?? 'image/jpeg'),
          'cache-control': 'private, max-age=86400',
        },
      });
    }

    // ---------- 登录后路由 ----------
    const auth = await authenticate(req);
    if (!auth) return fail(401, '未登录或登录已过期');

    const res = await dispatch(allRoutes, method, path, req, url, auth);
    if (res) return res;

    return fail(404, `接口不存在：${method} ${path}`);
  } catch (e) {
    console.error(e);
    return fail(500, e instanceof Error ? e.message : '服务器内部错误');
  }
}

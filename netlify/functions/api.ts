/**
 * 普瑞QMS 后端 API（Netlify Functions v2 + Netlify Blobs）
 * 单函数多路由：/api/*
 */
import type { Config, Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import type {
  Batch,
  BatchStatus,
  InspectionItemResult,
  Role,
  User,
  UserWithHash,
} from '../../shared/types';
import { toSummary } from '../../shared/types';
import { getSamplingPlan } from '../../shared/sampling';
import { COMPONENT_TYPES, getComponentType } from '../../shared/masterdata';
import { buildDemoBatches } from './seed-data';

export const config: Config = { path: '/api/*' };

const enc = new TextEncoder();
function jwtSecret(): Uint8Array {
  // 生产环境务必在 Netlify 环境变量中设置 JWT_SECRET
  const s = process.env.JWT_SECRET || 'purui-qms-demo-secret-change-me-in-production';
  return enc.encode(s);
}

// strong 一致性：保证写后立读（登录、审核、台账列表）拿到最新数据
const usersStore = () => getStore({ name: 'qms-users', consistency: 'strong' });
const batchStore = () => getStore({ name: 'qms-batches', consistency: 'strong' });
const fileStore = () => getStore({ name: 'qms-attachments', consistency: 'strong' });

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
function fail(status: number, message: string): Response {
  return json({ error: message }, status);
}

async function signToken(user: User): Promise<string> {
  return await new SignJWT({ role: user.role, name: user.name, username: user.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(jwtSecret());
}

interface AuthInfo {
  userId: string;
  username: string;
  name: string;
  role: Role;
}

async function authenticate(req: Request): Promise<AuthInfo | null> {
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
    };
  } catch {
    return null;
  }
}

// ---------------- 初始数据播种 ----------------

const DEMO_USERS: { username: string; name: string; role: Role; password: string }[] = [
  { username: 'admin', name: '系统管理员', role: 'admin', password: 'Admin@123' },
  { username: 'qe', name: '钱质量（质量工程师）', role: 'qe', password: 'Qe@123456' },
  { username: 'inspector', name: '简检验（检验员）', role: 'inspector', password: 'Insp@123' },
];

/** 播种版本：修改演示数据后递增，触发重新播种（并清理旧演示/测试数据） */
const SEED_VERSION = 'v3';

async function ensureSeed(): Promise<void> {
  const us = usersStore();
  const flag = await us.get('__seeded__', { type: 'text' });
  if (flag === SEED_VERSION) return;

  // 清理自动化测试残留用户
  const userList = await us.list({ prefix: 'user-e2e_' });
  for (const b of userList.blobs) await us.delete(b.key);

  for (const d of DEMO_USERS) {
    const u: UserWithHash = {
      id: crypto.randomUUID(),
      username: d.username,
      name: d.name,
      role: d.role,
      active: true,
      createdAt: new Date().toISOString(),
      passwordHash: bcrypt.hashSync(d.password, 10),
    };
    await us.setJSON(`user-${d.username}`, u);
  }

  const bs = batchStore();
  // 清理旧演示批次与自动化测试残留后重新播种，保证演示数据与代码一致
  const { blobs } = await bs.list({ prefix: 'batch-' });
  const olds = await Promise.all(
    blobs.map((b) => bs.get(b.key, { type: 'json' }) as Promise<Batch>),
  );
  for (let i = 0; i < blobs.length; i++) {
    const old = olds[i];
    if (old?.demo || old?.supplier === '自动化测试供应商') await bs.delete(blobs[i].key);
  }
  for (const b of buildDemoBatches()) {
    await bs.setJSON(`batch-${b.id}`, b);
  }
  await us.set('__seeded__', SEED_VERSION);
}

// ---------------- 业务处理 ----------------

async function listBatches(): Promise<Batch[]> {
  const bs = batchStore();
  const { blobs } = await bs.list({ prefix: 'batch-' });
  const items = await Promise.all(
    blobs.map((b) => bs.get(b.key, { type: 'json' }) as Promise<Batch>),
  );
  return items
    .filter(Boolean)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function getBatch(id: string): Promise<Batch | null> {
  return (await batchStore().get(`batch-${id}`, { type: 'json' })) as Batch | null;
}

function nextBatchNo(existing: Batch[], componentCode: string): string {
  const today = new Date();
  const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const prefix = `IQC-${componentCode}-${ymd}`;
  const count = existing.filter((b) => b.batchNo.startsWith(prefix)).length;
  return `${prefix}-${String(count + 1).padStart(3, '0')}`;
}

/** 依据 Ac/Re 判定批合格：不合格品数 <= Ac 接收 */
function judgeLot(defectiveCount: number, ac: number): boolean {
  return defectiveCount <= ac;
}

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

    // 附件读取（供 <img> 标签直接引用，UUID 本身即访问凭据）
    const attGetMatch = path.match(/^\/attachments\/([0-9a-f-]+)$/);
    if (attGetMatch && method === 'GET') {
      const fs = fileStore();
      const meta = await fs.getWithMetadata(attGetMatch[1], { type: 'arrayBuffer' });
      if (!meta) return fail(404, '附件不存在');
      return new Response(meta.data, {
        headers: {
          'content-type': String(meta.metadata?.contentType ?? 'image/jpeg'),
          'cache-control': 'private, max-age=86400',
        },
      });
    }

    // ---------- 以下均需登录 ----------
    const auth = await authenticate(req);
    if (!auth) return fail(401, '未登录或登录已过期');

    if (path === '/me' && method === 'GET') {
      return json(auth);
    }

    if (path === '/batches' && method === 'GET') {
      const all = await listBatches();
      const status = url.searchParams.get('status');
      const filtered = status ? all.filter((b) => b.status === status) : all;
      return json(filtered.map(toSummary));
    }

    if (path === '/batches' && method === 'POST') {
      if (auth.role !== 'inspector' && auth.role !== 'admin') {
        return fail(403, '仅检验员或管理员可登记来料');
      }
      const body = (await req.json()) as {
        componentTypeId: string;
        supplier: string;
        supplierLotNo?: string;
        quantity: number;
        arrivalDate: string;
        poNo?: string;
        project?: string;
      };
      const ct = getComponentType(body.componentTypeId);
      if (!ct) return fail(400, '组部件类型不存在');
      const qty = Math.floor(Number(body.quantity));
      if (!Number.isFinite(qty) || qty < 2 || qty > 500000) {
        return fail(400, '批量数量须为 2–500000 的整数');
      }
      if (!body.supplier?.trim()) return fail(400, '请填写供应商');
      if (!body.arrivalDate) return fail(400, '请填写到货日期');

      const all = await listBatches();
      const now = new Date().toISOString();
      const batch: Batch = {
        id: crypto.randomUUID(),
        batchNo: nextBatchNo(all, ct.code),
        componentTypeId: ct.id,
        componentTypeName: ct.name,
        supplier: body.supplier.trim(),
        supplierLotNo: body.supplierLotNo?.trim(),
        quantity: qty,
        arrivalDate: body.arrivalDate,
        poNo: body.poNo?.trim(),
        project: body.project?.trim(),
        status: 'pending_inspection',
        sampling: getSamplingPlan(qty, ct.aql),
        history: [
          { at: now, by: auth.userId, byName: auth.name, action: '来料登记' },
        ],
        createdBy: auth.userId,
        createdByName: auth.name,
        createdAt: now,
      };
      await batchStore().setJSON(`batch-${batch.id}`, batch);
      return json(batch, 201);
    }

    const batchIdMatch = path.match(/^\/batches\/([0-9a-f-]+)$/);
    if (batchIdMatch && method === 'GET') {
      const b = await getBatch(batchIdMatch[1]);
      return b ? json(b) : fail(404, '批次不存在');
    }

    const inspMatch = path.match(/^\/batches\/([0-9a-f-]+)\/inspection$/);
    if (inspMatch && method === 'POST') {
      if (auth.role !== 'inspector' && auth.role !== 'admin') {
        return fail(403, '仅检验员或管理员可录入检验结果');
      }
      const b = await getBatch(inspMatch[1]);
      if (!b) return fail(404, '批次不存在');
      if (b.status !== 'pending_inspection') return fail(409, '该批次当前不可录入检验结果');

      const body = (await req.json()) as {
        items: InspectionItemResult[];
        defectiveCount: number;
        attachmentIds?: string[];
        note?: string;
      };
      const defectiveCount = Math.floor(Number(body.defectiveCount));
      if (!Number.isFinite(defectiveCount) || defectiveCount < 0 || defectiveCount > b.sampling.sampleSize) {
        return fail(400, `不合格品数须在 0–${b.sampling.sampleSize} 之间`);
      }
      if (!Array.isArray(body.items) || body.items.length === 0) {
        return fail(400, '缺少检验项目结果');
      }
      const lotPass = judgeLot(defectiveCount, b.sampling.ac);
      const now = new Date().toISOString();
      b.inspection = {
        inspectorId: auth.userId,
        inspectorName: auth.name,
        inspectedAt: now,
        items: body.items,
        defectiveCount,
        lotPass,
        attachmentIds: body.attachmentIds ?? [],
        note: body.note,
      };
      b.status = 'pending_review';
      b.history.push({
        at: now,
        by: auth.userId,
        byName: auth.name,
        action: `检验完成：不合格品数 ${defectiveCount}（Ac=${b.sampling.ac}/Re=${b.sampling.re}），初判${lotPass ? '接收' : '拒收'}`,
        note: body.note,
      });
      await batchStore().setJSON(`batch-${b.id}`, b);
      return json(b);
    }

    const reviewMatch = path.match(/^\/batches\/([0-9a-f-]+)\/review$/);
    if (reviewMatch && method === 'POST') {
      if (auth.role !== 'qe' && auth.role !== 'admin') {
        return fail(403, '仅质量工程师或管理员可审核');
      }
      const b = await getBatch(reviewMatch[1]);
      if (!b) return fail(404, '批次不存在');
      if (b.status !== 'pending_review') return fail(409, '该批次当前不可审核');
      if (!b.inspection) return fail(409, '缺少检验记录');

      const body = (await req.json()) as {
        decision: 'accept' | 'return' | 'sort' | 'concession' | 'reinspect';
        note?: string;
      };
      const now = new Date().toISOString();
      const decisions: Record<string, { status: BatchStatus; label: string }> = {
        accept: { status: 'accepted', label: '审核通过，合格接收' },
        return: { status: 'rejected_return', label: 'MRB 处置：退货' },
        sort: { status: 'rejected_sort', label: 'MRB 处置：全检挑选' },
        concession: { status: 'concession', label: 'MRB 处置：让步接收' },
        reinspect: { status: 'pending_inspection', label: '退回重新检验' },
      };
      const d = decisions[body.decision];
      if (!d) return fail(400, '无效的处置决定');
      // 合格批只能接收或退回重检；不合格批不允许直接"合格接收"
      if (b.inspection.lotPass && (body.decision === 'return' || body.decision === 'sort' || body.decision === 'concession')) {
        return fail(400, '检验合格的批次只能选择"合格接收"或"退回重检"');
      }
      if (!b.inspection.lotPass && body.decision === 'accept') {
        return fail(400, '检验不合格的批次不能直接合格接收，请走 MRB 处置（退货/挑选/让步）');
      }
      if (body.decision !== 'accept' && body.decision !== 'reinspect' && !body.note?.trim()) {
        return fail(400, 'MRB 处置必须填写处置理由');
      }

      if (body.decision === 'reinspect') {
        b.inspection = undefined;
        b.review = undefined;
      } else {
        b.review = {
          reviewerId: auth.userId,
          reviewerName: auth.name,
          reviewedAt: now,
          decision: body.decision,
          note: body.note,
        };
      }
      b.status = d.status;
      b.history.push({ at: now, by: auth.userId, byName: auth.name, action: d.label, note: body.note });
      await batchStore().setJSON(`batch-${b.id}`, b);
      return json(b);
    }

    // ---------- 附件（检验照片）上传 ----------
    if (path === '/attachments' && method === 'POST') {
      const body = (await req.json()) as { name?: string; contentType?: string; dataBase64?: string };
      if (!body.dataBase64 || !body.contentType?.startsWith('image/')) {
        return fail(400, '仅支持图片附件');
      }
      const bytes = Uint8Array.from(atob(body.dataBase64), (c) => c.charCodeAt(0));
      if (bytes.byteLength > 4 * 1024 * 1024) return fail(400, '图片不能超过 4 MB');
      const id = crypto.randomUUID();
      await fileStore().set(id, bytes.buffer as ArrayBuffer, {
        metadata: { name: body.name ?? 'photo', contentType: body.contentType, by: auth.userId },
      });
      return json({ id }, 201);
    }

    // ---------- 统计 ----------
    if (path === '/stats' && method === 'GET') {
      const all = await listBatches();
      const inspected = all.filter((b) => b.inspection);
      const byStatus: Record<string, number> = {};
      for (const b of all) byStatus[b.status] = (byStatus[b.status] ?? 0) + 1;

      const bySupplier: Record<string, { total: number; passed: number }> = {};
      for (const b of inspected) {
        const s = (bySupplier[b.supplier] ??= { total: 0, passed: 0 });
        s.total += 1;
        if (b.inspection!.lotPass) s.passed += 1;
      }
      const byComponent: Record<string, { total: number; passed: number }> = {};
      for (const b of inspected) {
        const s = (byComponent[b.componentTypeName] ??= { total: 0, passed: 0 });
        s.total += 1;
        if (b.inspection!.lotPass) s.passed += 1;
      }
      const byMonth: Record<string, { total: number; passed: number }> = {};
      for (const b of inspected) {
        const month = b.inspection!.inspectedAt.slice(0, 7);
        const s = (byMonth[month] ??= { total: 0, passed: 0 });
        s.total += 1;
        if (b.inspection!.lotPass) s.passed += 1;
      }
      return json({
        totalBatches: all.length,
        pendingInspection: byStatus['pending_inspection'] ?? 0,
        pendingReview: byStatus['pending_review'] ?? 0,
        inspectedLots: inspected.length,
        passedLots: inspected.filter((b) => b.inspection!.lotPass).length,
        byStatus,
        bySupplier,
        byComponent,
        byMonth,
      });
    }

    // ---------- 用户管理（管理员） ----------
    if (path === '/users' && method === 'GET') {
      if (auth.role !== 'admin') return fail(403, '仅管理员可查看用户');
      const us = usersStore();
      const { blobs } = await us.list({ prefix: 'user-' });
      const users = await Promise.all(
        blobs.map((b) => us.get(b.key, { type: 'json' }) as Promise<UserWithHash>),
      );
      return json(users.filter(Boolean).map(({ passwordHash: _ph, ...u }) => u));
    }

    if (path === '/users' && method === 'POST') {
      if (auth.role !== 'admin') return fail(403, '仅管理员可创建用户');
      const body = (await req.json()) as { username?: string; name?: string; role?: Role; password?: string };
      const username = body.username?.trim();
      if (!username || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        return fail(400, '用户名须为 3–20 位字母、数字或下划线');
      }
      if (!body.name?.trim()) return fail(400, '请填写姓名');
      if (!body.password || body.password.length < 8) return fail(400, '密码至少 8 位');
      if (!['inspector', 'qe', 'admin'].includes(body.role ?? '')) return fail(400, '角色无效');
      const us = usersStore();
      if (await us.get(`user-${username}`)) return fail(409, '用户名已存在');
      const u: UserWithHash = {
        id: crypto.randomUUID(),
        username,
        name: body.name.trim(),
        role: body.role as Role,
        active: true,
        createdAt: new Date().toISOString(),
        passwordHash: bcrypt.hashSync(body.password, 10),
      };
      await us.setJSON(`user-${username}`, u);
      const { passwordHash: _ph, ...pub } = u;
      return json(pub, 201);
    }

    const userMatch = path.match(/^\/users\/([a-zA-Z0-9_]+)$/);
    if (userMatch && method === 'PATCH') {
      if (auth.role !== 'admin') return fail(403, '仅管理员可修改用户');
      const us = usersStore();
      const u = (await us.get(`user-${userMatch[1]}`, { type: 'json' })) as UserWithHash | null;
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
    }

    return fail(404, `接口不存在：${method} ${path}`);
  } catch (e) {
    console.error(e);
    return fail(500, e instanceof Error ? e.message : '服务器内部错误');
  }
}

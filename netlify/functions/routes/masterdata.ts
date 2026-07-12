/**
 * 主数据路由：物料 / 供应商 / 客户 / 计量单位 / 缺陷库 / 检验方法 / 检验标准
 */
import type {
  DefectCode,
  InspectionMethod,
  InspectionStandard,
  Material,
  Partner,
  Unit,
} from '../../../shared/types';
import { getSamplingPlanByConfig } from '../../../shared/sampling';
import type { Route } from '../lib';
import { deleteEntity, fail, getEntity, json, listByPrefix, putEntity } from '../lib';

function sortByCode<T extends { code?: string; name?: string }>(xs: T[]): T[] {
  return xs.sort((a, b) => String(a.code ?? a.name).localeCompare(String(b.code ?? b.name)));
}

/** 通用主数据 CRUD 工厂（管理员可写，内部用户可读） */
function crud<T extends { id: string }>(
  path: string,
  prefix: string,
  validate: (body: Partial<T>) => string | null,
  build: (body: Partial<T>, existing?: T) => T,
): Route[] {
  return [
    {
      method: 'GET',
      pattern: new RegExp(`^/${path}$`),
      handler: async () => json(sortByCode(await listByPrefix<T & { code?: string }>(prefix))),
    },
    {
      method: 'POST',
      pattern: new RegExp(`^/${path}$`),
      roles: ['admin', 'qe'],
      handler: async ({ req }) => {
        const body = (await req.json()) as Partial<T>;
        const err = validate(body);
        if (err) return fail(400, err);
        const entity = build(body);
        await putEntity(prefix, entity.id, entity);
        return json(entity, 201);
      },
    },
    {
      method: 'PUT',
      pattern: new RegExp(`^/${path}/([\\w-]+)$`),
      roles: ['admin', 'qe'],
      handler: async ({ req, match }) => {
        const existing = await getEntity<T>(prefix, match[1]);
        if (!existing) return fail(404, '记录不存在');
        const body = (await req.json()) as Partial<T>;
        const err = validate({ ...existing, ...body });
        if (err) return fail(400, err);
        const entity = build({ ...existing, ...body }, existing);
        entity.id = existing.id;
        await putEntity(prefix, entity.id, entity);
        return json(entity);
      },
    },
    {
      method: 'DELETE',
      pattern: new RegExp(`^/${path}/([\\w-]+)$`),
      roles: ['admin'],
      handler: async ({ match }) => {
        const existing = await getEntity<T>(prefix, match[1]);
        if (!existing) return fail(404, '记录不存在');
        await deleteEntity(prefix, match[1]);
        return json({ ok: true });
      },
    },
  ];
}

const materialRoutes = crud<Material>(
  'materials',
  'material-',
  (b) => {
    if (!b.code?.trim()) return '请填写物料编码';
    if (!b.name?.trim()) return '请填写物料名称';
    if (!b.categoryPath?.trim()) return '请填写物料分类';
    return null;
  },
  (b, existing) => ({
    id: existing?.id ?? crypto.randomUUID(),
    code: b.code!.trim(),
    name: b.name!.trim(),
    categoryPath: b.categoryPath!.trim(),
    unit: b.unit?.trim() || '件',
    spec: b.spec?.trim(),
    standardId: b.standardId || undefined,
    supplierRefs: b.supplierRefs ?? existing?.supplierRefs,
    active: b.active ?? true,
    demo: existing?.demo,
  }),
);

const partnerRoutes = crud<Partner>(
  'partners',
  'partner-',
  (b) => {
    if (!b.code?.trim()) return '请填写编码';
    if (!b.name?.trim()) return '请填写名称';
    if (b.partnerKind !== 'supplier' && b.partnerKind !== 'customer') return '类型无效';
    return null;
  },
  (b, existing) => ({
    id: existing?.id ?? crypto.randomUUID(),
    code: b.code!.trim(),
    name: b.name!.trim(),
    partnerKind: b.partnerKind!,
    type: b.type?.trim(),
    contact: b.contact?.trim(),
    phone: b.phone?.trim(),
    email: b.email?.trim(),
    address: b.address?.trim(),
    active: b.active ?? true,
    demo: existing?.demo,
  }),
);

const unitRoutes = crud<Unit>(
  'unit-list',
  'unit-',
  (b) => (!b.name?.trim() ? '请填写单位名称' : null),
  (b, existing) => ({
    id: existing?.id ?? crypto.randomUUID(),
    name: b.name!.trim(),
    symbol: b.symbol?.trim() || b.name!.trim(),
  }),
);

const defectRoutes = crud<DefectCode>(
  'defects',
  'defect-',
  (b) => {
    if (!b.code?.trim()) return '请填写缺陷代码';
    if (!b.name?.trim()) return '请填写缺陷名称';
    if (!['Cr', 'Ma', 'Mi'].includes(b.severity ?? '')) return '严重度无效';
    return null;
  },
  (b, existing) => ({
    id: existing?.id ?? crypto.randomUUID(),
    code: b.code!.trim(),
    name: b.name!.trim(),
    severity: b.severity!,
    score: Number(b.score) || (b.severity === 'Cr' ? 10 : b.severity === 'Ma' ? 5 : 1),
    demo: existing?.demo,
  }),
);

const methodRoutes = crud<InspectionMethod>(
  'methods',
  'method-',
  (b) => (!b.name?.trim() ? '请填写方法名称' : null),
  (b, existing) => ({
    id: existing?.id ?? crypto.randomUUID(),
    name: b.name!.trim(),
    instrument: b.instrument?.trim(),
    demo: existing?.demo,
  }),
);

const standardRoutes = crud<InspectionStandard>(
  'standards',
  'standard-',
  (b) => {
    if (!b.code?.trim()) return '请填写标准编号';
    if (!b.name?.trim()) return '请填写标准名称';
    if (!b.sampling?.mode) return '请配置抽样方式';
    if (b.sampling.mode === 'aql' && !b.sampling.aql) return 'AQL 方式须填写 AQL 值';
    if (b.sampling.mode === 'fixed' && !b.sampling.fixedN) return '固定方式须填写样本量';
    if (b.sampling.mode === 'percent' && !b.sampling.percent) return '百分比方式须填写比例';
    if (!Array.isArray(b.items) || b.items.length === 0) return '至少配置 1 个检验条目';
    for (const it of b.items) {
      if (!it.name?.trim()) return '检验条目须有名称';
      if (it.kind === 'quantitative' && it.min === undefined && it.max === undefined) {
        return `计量型条目"${it.name}"须至少设置上限或下限`;
      }
      if (
        it.kind === 'quantitative' &&
        it.min !== undefined && it.max !== undefined && it.min >= it.max
      ) {
        return `条目"${it.name}"下限须小于上限`;
      }
    }
    // 校验抽样配置本身可生成方案
    try {
      getSamplingPlanByConfig(1000, b.sampling);
    } catch (e) {
      return e instanceof Error ? e.message : '抽样配置无效';
    }
    return null;
  },
  (b, existing) => ({
    id: existing?.id ?? crypto.randomUUID(),
    code: b.code!.trim(),
    name: b.name!.trim(),
    description: b.description?.trim(),
    sampling: b.sampling!,
    items: b.items!.map((it) => ({ ...it, id: it.id || crypto.randomUUID() })),
    skipRule: b.skipRule,
    autoApprovePass: b.autoApprovePass ?? false,
    active: b.active ?? true,
    demo: existing?.demo,
  }),
);

/** CSV 导入（物料/供应商/客户）：POST /import/:kind  body:{csv} */
const importRoute: Route = {
  method: 'POST',
  pattern: /^\/import\/(materials|suppliers|customers)$/,
  roles: ['admin', 'qe'],
  handler: async ({ req, match }) => {
    const { csv } = (await req.json()) as { csv?: string };
    if (!csv?.trim()) return fail(400, 'CSV 内容为空');
    const lines = csv.trim().split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return fail(400, 'CSV 须含表头与至少一行数据');
    const rows = lines.slice(1).map((l) => l.split(',').map((c) => c.trim()));
    let created = 0;
    const errors: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        if (match[1] === 'materials') {
          if (!r[0] || !r[1]) throw new Error('编码与名称必填');
          const m: Material = {
            id: crypto.randomUUID(),
            code: r[0],
            name: r[1],
            categoryPath: r[2] || '未分类',
            unit: r[3] || '件',
            spec: r[4] || undefined,
            active: true,
          };
          await putEntity('material-', m.id, m);
        } else {
          if (!r[0] || !r[1]) throw new Error('编码与名称必填');
          const p: Partner = {
            id: crypto.randomUUID(),
            code: r[0],
            name: r[1],
            partnerKind: match[1] === 'suppliers' ? 'supplier' : 'customer',
            type: r[2] || undefined,
            contact: r[3] || undefined,
            phone: r[4] || undefined,
            email: r[5] || undefined,
            active: true,
          };
          await putEntity('partner-', p.id, p);
        }
        created += 1;
      } catch (e) {
        errors.push(`第 ${i + 2} 行：${e instanceof Error ? e.message : '格式错误'}`);
      }
    }
    return json({ created, errors });
  },
};

/** 抽样方案预览（按标准配置）：GET /sampling-preview?lot=&standardId= 或 mode/aql/... */
const samplingPreview: Route = {
  method: 'GET',
  pattern: /^\/sampling-preview$/,
  internalOnly: false,
  handler: async ({ url }) => {
    const lot = Math.floor(Number(url.searchParams.get('lot')));
    if (!Number.isFinite(lot) || lot < 2) return fail(400, '批量无效');
    const standardId = url.searchParams.get('standardId');
    if (standardId) {
      const std = await getEntity<InspectionStandard>('standard-', standardId);
      if (!std) return fail(404, '标准不存在');
      return json(getSamplingPlanByConfig(lot, std.sampling));
    }
    const mode = (url.searchParams.get('mode') ?? 'aql') as 'aql' | 'fixed' | 'percent';
    try {
      return json(
        getSamplingPlanByConfig(lot, {
          mode,
          aql: Number(url.searchParams.get('aql')) || undefined,
          fixedN: Number(url.searchParams.get('fixedN')) || undefined,
          fixedAc: Number(url.searchParams.get('fixedAc')) || 0,
          percent: Number(url.searchParams.get('percent')) || undefined,
          percentAc: Number(url.searchParams.get('percentAc')) || 0,
        }),
      );
    } catch (e) {
      return fail(400, e instanceof Error ? e.message : '抽样配置无效');
    }
  },
};

export const masterdataRoutes: Route[] = [
  ...materialRoutes,
  ...partnerRoutes,
  ...unitRoutes,
  ...defectRoutes,
  ...methodRoutes,
  ...standardRoutes,
  importRoute,
  samplingPreview,
];

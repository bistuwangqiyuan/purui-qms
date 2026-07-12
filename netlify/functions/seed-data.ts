/**
 * 演示数据生成（仅首次启动播种，批次带 demo 标记）。
 *
 * 说明：演示批次用于展示系统统计与报表能力，供应商为通用类别化名，
 * 检验数据为按检验模板公差范围生成的示例值，非任何真实供货记录。
 * 抽样方案严格按 GB/T 2828.1-2012 由批量与 AQL 实时计算。
 */
import type { Batch, InspectionItemResult } from '../../shared/types';
import { getSamplingPlan } from '../../shared/sampling';
import { COMPONENT_TYPES, DEMO_SUPPLIERS } from '../../shared/masterdata';

/** 确定性伪随机（保证每次播种结果一致、可复核） */
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

export function buildDemoBatches(): Batch[] {
  const rand = mulberry32(20260712);
  const batches: Batch[] = [];
  const now = new Date();

  const plans: {
    typeIdx: number;
    supplierIdx: number;
    qty: number;
    monthsAgo: number;
    day: number;
    defective: number; // 抽检发现的不合格品数
    reviewed: boolean;
  }[] = [
    { typeIdx: 0, supplierIdx: 0, qty: 1200, monthsAgo: 5, day: 6, defective: 0, reviewed: true },
    { typeIdx: 0, supplierIdx: 1, qty: 800, monthsAgo: 4, day: 12, defective: 2, reviewed: true },
    { typeIdx: 3, supplierIdx: 2, qty: 2400, monthsAgo: 4, day: 20, defective: 0, reviewed: true },
    { typeIdx: 1, supplierIdx: 4, qty: 600, monthsAgo: 3, day: 8, defective: 0, reviewed: true },
    { typeIdx: 4, supplierIdx: 2, qty: 1500, monthsAgo: 3, day: 15, defective: 1, reviewed: true },
    { typeIdx: 2, supplierIdx: 3, qty: 300, monthsAgo: 2, day: 3, defective: 0, reviewed: true },
    { typeIdx: 6, supplierIdx: 1, qty: 500, monthsAgo: 2, day: 18, defective: 3, reviewed: true },
    { typeIdx: 8, supplierIdx: 4, qty: 2000, monthsAgo: 1, day: 5, defective: 0, reviewed: true },
    { typeIdx: 10, supplierIdx: 4, qty: 900, monthsAgo: 1, day: 16, defective: 1, reviewed: true },
    { typeIdx: 5, supplierIdx: 2, qty: 1000, monthsAgo: 0, day: 2, defective: 0, reviewed: true },
    { typeIdx: 7, supplierIdx: 4, qty: 750, monthsAgo: 0, day: 5, defective: 0, reviewed: false }, // 待审核
    { typeIdx: 9, supplierIdx: 3, qty: 400, monthsAgo: 0, day: 8, defective: 0, reviewed: false }, // 待检验
  ];

  let seq = 1;
  for (const p of plans) {
    const ct = COMPONENT_TYPES[p.typeIdx];
    const supplier = DEMO_SUPPLIERS[p.supplierIdx];
    const d = new Date(now.getFullYear(), now.getMonth() - p.monthsAgo, p.day, 9, 30);
    if (d > now) d.setMonth(d.getMonth() - 1);
    const iso = d.toISOString();
    const ymd = iso.slice(0, 10);
    const sampling = getSamplingPlan(p.qty, ct.aql);
    const isLast = seq === plans.length;
    const inspected = !isLast; // 最后一批保持"待检验"

    const batch: Batch = {
      id: crypto.randomUUID(),
      batchNo: `IQC-${ct.code}-${ymd.replace(/-/g, '')}-${String(seq).padStart(3, '0')}`,
      componentTypeId: ct.id,
      componentTypeName: ct.name,
      supplier,
      supplierLotNo: `LOT-${ymd.replace(/-/g, '')}-${Math.floor(rand() * 900 + 100)}`,
      quantity: p.qty,
      arrivalDate: ymd,
      poNo: `PO-2026-${String(1000 + seq * 7)}`,
      project: seq % 2 === 0 ? '某特高压直流输电工程（演示）' : '某柔性直流输电工程（演示）',
      status: 'pending_inspection',
      sampling,
      history: [
        { at: iso, by: 'seed', byName: '系统演示数据', action: '来料登记' },
      ],
      createdBy: 'seed',
      createdByName: '系统演示数据',
      createdAt: iso,
      demo: true,
    };

    if (inspected) {
      const inspAt = new Date(d.getTime() + 26 * 3600 * 1000).toISOString();
      const items: InspectionItemResult[] = ct.items.map((tpl, ti) => {
        // 将批不合格品归到第一个定量项目上，其余项目全部合格
        const defects = ti === 1 ? p.defective : 0;
        if (tpl.kind === 'quantitative' && tpl.min !== undefined && tpl.max !== undefined) {
          const span = tpl.max - tpl.min;
          const values = Array.from({ length: Math.min(sampling.sampleSize, 5) }, () =>
            Number((tpl.min! + span * (0.25 + rand() * 0.5)).toFixed(4)),
          );
          return { templateId: tpl.id, name: tpl.name, kind: tpl.kind, unit: tpl.unit, min: tpl.min, max: tpl.max, values, defects, pass: defects === 0 };
        }
        return {
          templateId: tpl.id,
          name: tpl.name,
          kind: tpl.kind,
          unit: tpl.unit,
          min: tpl.min,
          max: tpl.max,
          qualitativePass: sampling.sampleSize - defects,
          defects,
          pass: defects === 0,
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
        at: inspAt,
        by: 'seed',
        byName: '简检验（检验员）',
        action: `检验完成：不合格品数 ${p.defective}（Ac=${sampling.ac}/Re=${sampling.re}），初判${lotPass ? '接收' : '拒收'}`,
      });

      if (p.reviewed) {
        const revAt = new Date(d.getTime() + 30 * 3600 * 1000).toISOString();
        const decision = lotPass ? 'accept' : (rand() > 0.5 ? 'return' : 'sort');
        batch.review = {
          reviewerId: 'seed',
          reviewerName: '钱质量（质量工程师）',
          reviewedAt: revAt,
          decision: decision as 'accept' | 'return' | 'sort',
          note: lotPass ? undefined : '不合格品数达到拒收数，按 MRB 决议处置（演示）',
        };
        batch.status = lotPass ? 'accepted' : decision === 'return' ? 'rejected_return' : 'rejected_sort';
        batch.history.push({
          at: revAt,
          by: 'seed',
          byName: '钱质量（质量工程师）',
          action: lotPass ? '审核通过，合格接收' : `MRB 处置：${decision === 'return' ? '退货' : '全检挑选'}`,
        });
      }
    }

    batches.push(batch);
    seq += 1;
  }
  return batches;
}

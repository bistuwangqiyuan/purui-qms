/**
 * GB/T 2828.1-2012《计数抽样检验程序 第1部分：按接收质量限（AQL）检索的逐批检验抽样计划》
 * （等同采用 ISO 2859-1:1999）
 *
 * 实现：一般检验水平 II、正常检验、一次抽样方案。
 * - 表1：样本量字码（按批量范围检索）
 * - 表2-A：正常检验一次抽样方案主表（含箭头规则：
 *   当字码与 AQL 交叉处无方案时，沿箭头方向使用第一个可用方案，样本量随之改变）
 *
 * 该实现可由 scripts/verify_sampling.py 独立复现并交叉校验。
 */

import type { SamplingPlan } from './types';

/** 样本量字码及其对应样本量（表1 / 表2-A 行头） */
export const CODE_LETTERS: { letter: string; sampleSize: number }[] = [
  { letter: 'A', sampleSize: 2 },
  { letter: 'B', sampleSize: 3 },
  { letter: 'C', sampleSize: 5 },
  { letter: 'D', sampleSize: 8 },
  { letter: 'E', sampleSize: 13 },
  { letter: 'F', sampleSize: 20 },
  { letter: 'G', sampleSize: 32 },
  { letter: 'H', sampleSize: 50 },
  { letter: 'J', sampleSize: 80 },
  { letter: 'K', sampleSize: 125 },
  { letter: 'L', sampleSize: 200 },
  { letter: 'M', sampleSize: 315 },
  { letter: 'N', sampleSize: 500 },
  { letter: 'P', sampleSize: 800 },
  { letter: 'Q', sampleSize: 1250 },
  { letter: 'R', sampleSize: 2000 },
];

/** 批量范围 → 一般检验水平 II 字码（表1） */
const LOT_RANGES: { max: number; letter: string }[] = [
  { max: 8, letter: 'A' },
  { max: 15, letter: 'B' },
  { max: 25, letter: 'C' },
  { max: 50, letter: 'D' },
  { max: 90, letter: 'E' },
  { max: 150, letter: 'F' },
  { max: 280, letter: 'G' },
  { max: 500, letter: 'H' },
  { max: 1200, letter: 'J' },
  { max: 3200, letter: 'K' },
  { max: 10000, letter: 'L' },
  { max: 35000, letter: 'M' },
  { max: 150000, letter: 'N' },
  { max: 500000, letter: 'P' },
  { max: Infinity, letter: 'Q' },
];

/**
 * 表2-A 中每一 AQL 列 Ac=0 方案所在的字码索引。
 * Ac=0 方案沿对角线分布：AQL 6.5→A(n=2)、4.0→B(n=3)、2.5→C(n=5)、1.5→D(n=8)、
 * 1.0→E(n=13)、0.65→F(n=20)、0.40→G(n=32)、0.25→H(n=50)、0.15→J(n=80)、
 * 0.10→K(n=125)、0.065→L(n=200)、0.040→M(n=315)、0.025→N(n=500)、
 * 0.015→P(n=800)、0.010→Q(n=1250)。
 */
const AQL_ZERO_INDEX: Record<string, number> = {
  '0.010': 14,
  '0.015': 13,
  '0.025': 12,
  '0.040': 11,
  '0.065': 10,
  '0.10': 9,
  '0.15': 8,
  '0.25': 7,
  '0.40': 6,
  '0.65': 5,
  '1.0': 4,
  '1.5': 3,
  '2.5': 2,
  '4.0': 1,
  '6.5': 0,
};

/**
 * 表2-A 列内结构（以 Ac=0 方案所在行为原点 offset=0，向下 offset 递增）：
 *   offset 0        → Ac=0
 *   offset 1        → ↑（使用上方 Ac=0 方案）
 *   offset 2        → ↓（使用下方 Ac=1 方案）
 *   offset 3..10    → Ac = 1, 2, 3, 5, 7, 10, 14, 21
 *   offset > 10     → ↑（使用 Ac=21 方案）
 *   offset < 0      → ↓（使用 Ac=0 方案）
 */
const AC_SEQUENCE = [1, 2, 3, 5, 7, 10, 14, 21];

export function aqlKey(aql: number): string {
  const keys = Object.keys(AQL_ZERO_INDEX);
  for (const k of keys) {
    if (Math.abs(parseFloat(k) - aql) < 1e-9) return k;
  }
  throw new Error(`AQL ${aql} 不在 GB/T 2828.1 优先数系列支持范围内`);
}

export function codeLetterForLot(lotSize: number): string {
  if (!Number.isFinite(lotSize) || lotSize < 2) {
    throw new Error('批量必须为不小于 2 的整数');
  }
  for (const r of LOT_RANGES) {
    if (lotSize <= r.max) return r.letter;
  }
  return 'Q';
}

/** 按字码与 AQL 检索表2-A（含箭头规则解析），返回实际执行的字码行与 Ac */
export function resolvePlan(letter: string, aql: number): { effectiveIndex: number; ac: number } {
  const zero = AQL_ZERO_INDEX[aqlKey(aql)];
  const idx = CODE_LETTERS.findIndex((c) => c.letter === letter);
  if (idx < 0) throw new Error(`未知字码 ${letter}`);
  const offset = idx - zero;

  let effOffset: number;
  if (offset < 0) effOffset = 0; // ↓ 用首个方案（Ac=0）
  else if (offset === 0) effOffset = 0;
  else if (offset === 1) effOffset = 0; // ↑
  else if (offset === 2) effOffset = 3; // ↓
  else if (offset <= 10) effOffset = offset;
  else effOffset = 10; // ↑ 用 Ac=21 方案

  let effIndex = zero + effOffset;
  // 超出表底（字码 R，n=2000）时向上取表内最后一个可用方案
  if (effIndex > CODE_LETTERS.length - 1) effIndex = CODE_LETTERS.length - 1;

  let finalOffset = effIndex - zero;
  // 安全兜底：若因表底裁剪落在箭头行（offset 1/2），回退到 Ac=0 方案
  if (finalOffset === 1 || finalOffset === 2) {
    effIndex = zero;
    finalOffset = 0;
  }
  const ac = finalOffset === 0 ? 0 : AC_SEQUENCE[finalOffset - 3];
  return { effectiveIndex: effIndex, ac };
}

import type { SamplingConfig } from './types';

/**
 * 按检验标准的抽样配置生成方案（三种方式）：
 * - aql：GB/T 2828.1-2012 检索（本文件核心实现）
 * - fixed：固定数量抽样（企业自定方案，Ac 由标准指定，默认 0）
 * - percent：百分比抽样（样本量 = ceil(N × percent%)，Ac 由标准指定，默认 0）
 */
export function getSamplingPlanByConfig(lotSize: number, cfg: SamplingConfig): SamplingPlan {
  if (cfg.mode === 'fixed') {
    const n = Math.max(1, Math.floor(cfg.fixedN ?? 5));
    const sampleSize = Math.min(n, lotSize);
    const ac = Math.max(0, Math.floor(cfg.fixedAc ?? 0));
    return {
      mode: 'fixed',
      lotSize,
      aql: 0,
      codeLetter: '-',
      effectiveLetter: '-',
      sampleSize,
      ac,
      re: ac + 1,
      fullInspection: sampleSize >= lotSize,
    };
  }
  if (cfg.mode === 'percent') {
    const pct = Math.min(100, Math.max(0.1, cfg.percent ?? 10));
    const sampleSize = Math.min(lotSize, Math.max(1, Math.ceil((lotSize * pct) / 100)));
    const ac = Math.max(0, Math.floor(cfg.percentAc ?? 0));
    return {
      mode: 'percent',
      lotSize,
      aql: 0,
      codeLetter: '-',
      effectiveLetter: '-',
      sampleSize,
      ac,
      re: ac + 1,
      fullInspection: sampleSize >= lotSize,
    };
  }
  const plan = getSamplingPlan(lotSize, cfg.aql ?? 1.0);
  plan.mode = 'aql';
  return plan;
}

/** 生成完整抽样方案：批量 + AQL → 字码、样本量、Ac/Re */
export function getSamplingPlan(lotSize: number, aql: number): SamplingPlan {
  const codeLetter = codeLetterForLot(lotSize);
  const { effectiveIndex, ac } = resolvePlan(codeLetter, aql);
  const eff = CODE_LETTERS[effectiveIndex];
  let sampleSize = eff.sampleSize;
  let fullInspection = false;
  // GB/T 2828.1 表2-A 注a：样本量等于或超过批量时，执行全数检验
  if (sampleSize >= lotSize) {
    sampleSize = lotSize;
    fullInspection = true;
  }
  return {
    lotSize,
    aql,
    codeLetter,
    effectiveLetter: eff.letter,
    sampleSize,
    ac,
    re: ac + 1,
    fullInspection,
  };
}

/**
 * SPC 统计过程控制计算库
 *
 * 公式与系数依据：
 * - GB/T 4091-2001《常规控制图》（等同 ISO 8258）表 2 计算控制限用系数：
 *   A2、D3、D4（Xbar-R 图，子组大小 n=2..10）、d2（由 R̄ 估计 σ）
 * - Cp/Cpk（组内能力，σ̂ = R̄/d2）与 Pp/Ppk（整体性能，样本标准差 s）：
 *   GB/T 3358.2 / 通用六西格玛教材公式
 * - 本库全部计算可由 scripts/verify_spc.py（零依赖 Python）独立复现校验。
 */

/** GB/T 4091 表 2：Xbar-R 图系数（索引为子组大小 n） */
export const XBAR_R_CONSTANTS: Record<number, { A2: number; D3: number; D4: number; d2: number }> = {
  2: { A2: 1.88, D3: 0, D4: 3.267, d2: 1.128 },
  3: { A2: 1.023, D3: 0, D4: 2.574, d2: 1.693 },
  4: { A2: 0.729, D3: 0, D4: 2.282, d2: 2.059 },
  5: { A2: 0.577, D3: 0, D4: 2.114, d2: 2.326 },
  6: { A2: 0.483, D3: 0, D4: 2.004, d2: 2.534 },
  7: { A2: 0.419, D3: 0.076, D4: 1.924, d2: 2.704 },
  8: { A2: 0.373, D3: 0.136, D4: 1.864, d2: 2.847 },
  9: { A2: 0.337, D3: 0.184, D4: 1.816, d2: 2.97 },
  10: { A2: 0.308, D3: 0.223, D4: 1.777, d2: 3.078 },
};

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** 样本标准差（n-1） */
export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export interface XbarRResult {
  n: number;
  xbarbar: number;
  rbar: number;
  xbarUCL: number;
  xbarLCL: number;
  rUCL: number;
  rLCL: number;
  xbars: number[];
  ranges: number[];
  /** σ̂ = R̄ / d2 */
  sigmaWithin: number;
}

/** Xbar-R 控制图（子组大小须一致，2..10） */
export function xbarR(subgroups: number[][]): XbarRResult {
  const n = subgroups[0].length;
  const c = XBAR_R_CONSTANTS[n];
  if (!c) throw new Error(`子组大小 ${n} 超出 GB/T 4091 表 2 支持范围（2-10）`);
  const xbars = subgroups.map(mean);
  const ranges = subgroups.map((g) => Math.max(...g) - Math.min(...g));
  const xbarbar = mean(xbars);
  const rbar = mean(ranges);
  return {
    n,
    xbarbar,
    rbar,
    xbarUCL: xbarbar + c.A2 * rbar,
    xbarLCL: xbarbar - c.A2 * rbar,
    rUCL: c.D4 * rbar,
    rLCL: c.D3 * rbar,
    xbars,
    ranges,
    sigmaWithin: rbar / c.d2,
  };
}

export interface CapabilityResult {
  cp?: number;
  cpk?: number;
  pp?: number;
  ppk?: number;
  mean: number;
  sigmaWithin?: number;
  sigmaOverall: number;
}

/**
 * 过程能力：
 * Cp = (USL-LSL)/(6σ̂within)，Cpk = min(USL-μ, μ-LSL)/(3σ̂within)
 * Pp/Ppk 同式但用整体样本标准差 s。单边公差时只给出 Cpk/Ppk。
 */
export function capability(
  values: number[],
  usl: number | undefined,
  lsl: number | undefined,
  sigmaWithin?: number,
): CapabilityResult {
  const mu = mean(values);
  const s = stdev(values);
  const res: CapabilityResult = { mean: mu, sigmaWithin, sigmaOverall: s };
  const calc = (sigma: number) => {
    if (sigma <= 0) return {};
    const upper = usl !== undefined ? (usl - mu) / (3 * sigma) : undefined;
    const lower = lsl !== undefined ? (mu - lsl) / (3 * sigma) : undefined;
    const k = [upper, lower].filter((v): v is number => v !== undefined);
    const index = k.length ? Math.min(...k) : undefined;
    const cpBoth = usl !== undefined && lsl !== undefined ? (usl - lsl) / (6 * sigma) : undefined;
    return { cp: cpBoth, cpk: index };
  };
  if (sigmaWithin !== undefined) {
    const w = calc(sigmaWithin);
    res.cp = w.cp;
    res.cpk = w.cpk;
  }
  const o = calc(s);
  res.pp = o.cp;
  res.ppk = o.cpk;
  return res;
}

/** 缺陷柏拉图：按数量降序 + 累计百分比 */
export function pareto(items: { name: string; count: number }[]): {
  name: string;
  count: number;
  cumPct: number;
}[] {
  const sorted = [...items].sort((a, b) => b.count - a.count);
  const total = sorted.reduce((a, b) => a + b.count, 0) || 1;
  let cum = 0;
  return sorted.map((it) => {
    cum += it.count;
    return { name: it.name, count: it.count, cumPct: Number(((cum / total) * 100).toFixed(2)) };
  });
}

/** PPM = 不合格品数 / 检验总数 × 1e6 */
export function ppm(defective: number, inspected: number): number {
  if (inspected <= 0) return 0;
  return Math.round((defective / inspected) * 1e6);
}

/** 直方图分箱（Sturges 规则缺省） */
export function histogram(values: number[], binCount?: number): { x0: number; x1: number; count: number }[] {
  if (!values.length) return [];
  const k = binCount ?? Math.max(5, Math.ceil(Math.log2(values.length) + 1));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min) / k || 1;
  const bins = Array.from({ length: k }, (_, i) => ({ x0: min + i * width, x1: min + (i + 1) * width, count: 0 }));
  for (const v of values) {
    let idx = Math.floor((v - min) / width);
    if (idx >= k) idx = k - 1;
    bins[idx].count += 1;
  }
  return bins;
}

/** 箱线图五数概括（四分位用 R-7/Excel 线性插值法，与 Python statistics.quantiles(method='inclusive') 一致） */
export function boxStats(values: number[]): { min: number; q1: number; median: number; q3: number; max: number } {
  const xs = [...values].sort((a, b) => a - b);
  const q = (p: number) => {
    const idx = (xs.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return xs[lo] + (xs[hi] - xs[lo]) * (idx - lo);
  };
  return { min: xs[0], q1: q(0.25), median: q(0.5), q3: q(0.75), max: xs[xs.length - 1] };
}

// ============================================================
// 自检数据集：与 scripts/verify_spc.py 中完全相同的固定数据，
// 两种语言独立计算，结果必须一致（可复现性验证）。
// ============================================================

/** 25 个子组 × 5 的示例计量数据（模拟阻尼电容器电容量 μF，名义 1.5，公差 1.425–1.575） */
export const SPC_SAMPLE_SUBGROUPS: number[][] = [
  [1.502, 1.498, 1.505, 1.5, 1.497],
  [1.51, 1.495, 1.5, 1.503, 1.499],
  [1.49, 1.505, 1.51, 1.494, 1.5],
  [1.5, 1.5, 1.497, 1.506, 1.502],
  [1.495, 1.503, 1.5, 1.492, 1.508],
  [1.505, 1.497, 1.5, 1.501, 1.495],
  [1.5, 1.51, 1.49, 1.5, 1.505],
  [1.498, 1.5, 1.503, 1.497, 1.5],
  [1.503, 1.494, 1.5, 1.508, 1.496],
  [1.5, 1.502, 1.498, 1.5, 1.504],
  [1.492, 1.5, 1.505, 1.499, 1.501],
  [1.5, 1.497, 1.5, 1.503, 1.5],
  [1.507, 1.5, 1.495, 1.5, 1.498],
  [1.5, 1.504, 1.5, 1.492, 1.503],
  [1.496, 1.5, 1.502, 1.505, 1.499],
  [1.5, 1.493, 1.5, 1.507, 1.5],
  [1.503, 1.5, 1.497, 1.5, 1.502],
  [1.499, 1.505, 1.5, 1.495, 1.5],
  [1.5, 1.5, 1.508, 1.494, 1.501],
  [1.497, 1.502, 1.5, 1.5, 1.496],
  [1.505, 1.5, 1.499, 1.503, 1.5],
  [1.5, 1.496, 1.504, 1.5, 1.507],
  [1.493, 1.5, 1.501, 1.498, 1.5],
  [1.5, 1.505, 1.497, 1.5, 1.503],
  [1.502, 1.499, 1.5, 1.506, 1.494],
];

export const SPC_SAMPLE_USL = 1.575;
export const SPC_SAMPLE_LSL = 1.425;

/** 自检：返回样例数据的全部统计量（e2e 与 Python 交叉校验用） */
export function spcSelfTest() {
  const xr = xbarR(SPC_SAMPLE_SUBGROUPS);
  const all = SPC_SAMPLE_SUBGROUPS.flat();
  const cap = capability(all, SPC_SAMPLE_USL, SPC_SAMPLE_LSL, xr.sigmaWithin);
  const par = pareto([
    { name: '外观划伤', count: 42 },
    { name: '尺寸超差', count: 18 },
    { name: '标识不清', count: 8 },
    { name: '性能不合格', count: 5 },
    { name: '包装破损', count: 2 },
  ]);
  return {
    xbarbar: Number(xr.xbarbar.toFixed(6)),
    rbar: Number(xr.rbar.toFixed(6)),
    xbarUCL: Number(xr.xbarUCL.toFixed(6)),
    xbarLCL: Number(xr.xbarLCL.toFixed(6)),
    rUCL: Number(xr.rUCL.toFixed(6)),
    rLCL: Number(xr.rLCL.toFixed(6)),
    sigmaWithin: Number(xr.sigmaWithin.toFixed(7)),
    cp: Number((cap.cp ?? 0).toFixed(4)),
    cpk: Number((cap.cpk ?? 0).toFixed(4)),
    pp: Number((cap.pp ?? 0).toFixed(4)),
    ppk: Number((cap.ppk ?? 0).toFixed(4)),
    ppmValue: ppm(3, 12500),
    paretoTop: par[0].name,
    paretoTopCumPct: par[0].cumPct,
  };
}

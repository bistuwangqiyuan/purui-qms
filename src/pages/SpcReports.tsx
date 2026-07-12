import { useEffect, useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import type { InspectionStandard, Material } from '../../shared/types';
import { boxStats, capability, histogram, pareto, xbarR } from '../../shared/spc';
import type { SpcSeries, Stats } from '../api';
import { api } from '../api';
import Chart from '../components/Chart';

export default function SpcReports() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [standards, setStandards] = useState<InspectionStandard[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [materialId, setMaterialId] = useState('');
  const [itemId, setItemId] = useState('');
  const [series, setSeries] = useState<SpcSeries | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.materials(), api.standards(), api.stats()])
      .then(([m, s, st]) => { setMaterials(m); setStandards(s); setStats(st); })
      .catch((e) => setError(e.message));
  }, []);

  const material = materials.find((m) => m.id === materialId);
  const standard = standards.find((s) => s.id === material?.standardId);
  const quantItems = (standard?.items ?? []).filter((i) => i.kind === 'quantitative');

  useEffect(() => {
    setSeries(null);
    if (!materialId || !itemId) return;
    let alive = true;
    api.spcSeries(materialId, itemId).then((s) => alive && setSeries(s)).catch((e) => setError(e.message));
    return () => { alive = false; };
  }, [materialId, itemId]);

  const analysis = useMemo(() => {
    if (!series || series.groups.length === 0) return null;
    const allValues = series.groups.flatMap((g) => g.values);
    // Xbar-R 需要等大小子组（2-10）：取多数子组大小
    const sizeCount: Record<number, number> = {};
    for (const g of series.groups) sizeCount[g.values.length] = (sizeCount[g.values.length] ?? 0) + 1;
    const commonSize = Number(Object.entries(sizeCount).sort((a, b) => b[1] - a[1])[0]?.[0]);
    const subgroups = series.groups.filter((g) => g.values.length === commonSize).map((g) => g.values);
    const xr = commonSize >= 2 && commonSize <= 10 && subgroups.length >= 2 ? xbarR(subgroups) : null;
    const cap = allValues.length >= 5 ? capability(allValues, series.usl, series.lsl, xr?.sigmaWithin) : null;
    return { allValues, xr, cap, subgroupLabels: series.groups.filter((g) => g.values.length === commonSize).map((g) => g.batchNo) };
  }, [series]);

  const trendOption = useMemo<EChartsOption | null>(() => {
    if (!series || !series.groups.length) return null;
    const means = series.groups.map((g) => Number((g.values.reduce((a, b) => a + b, 0) / g.values.length).toFixed(5)));
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 60, right: 24, top: 32, bottom: 60 },
      xAxis: { type: 'category', data: series.groups.map((g) => g.batchNo), axisLabel: { rotate: 35, fontSize: 10 } },
      yAxis: { type: 'value', scale: true, name: series.unit },
      series: [
        { name: '批均值', type: 'line', data: means, symbolSize: 7, lineStyle: { width: 2.5 } },
        ...(series.usl !== undefined ? [{ name: 'USL', type: 'line' as const, data: series.groups.map(() => series.usl!), lineStyle: { type: 'dashed' as const, color: '#c22f2f' }, symbol: 'none' }] : []),
        ...(series.lsl !== undefined ? [{ name: 'LSL', type: 'line' as const, data: series.groups.map(() => series.lsl!), lineStyle: { type: 'dashed' as const, color: '#c22f2f' }, symbol: 'none' }] : []),
      ],
    };
  }, [series]);

  const individualsOption = useMemo<EChartsOption | null>(() => {
    if (!series) return null;
    const pts: [number, number][] = [];
    let idx = 0;
    for (const g of series.groups) for (const v of g.values) pts.push([idx++, v]);
    if (!pts.length) return null;
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 60, right: 24, top: 32, bottom: 32 },
      xAxis: { type: 'value', name: '样本序号', minInterval: 1 },
      yAxis: { type: 'value', scale: true, name: series.unit },
      series: [
        { name: '实测值', type: 'scatter', data: pts, symbolSize: 6 },
        ...(series.usl !== undefined ? [{ name: 'USL', type: 'line' as const, data: [[0, series.usl], [pts.length - 1, series.usl]] as [number, number][], lineStyle: { type: 'dashed' as const, color: '#c22f2f' }, symbol: 'none' }] : []),
        ...(series.lsl !== undefined ? [{ name: 'LSL', type: 'line' as const, data: [[0, series.lsl], [pts.length - 1, series.lsl]] as [number, number][], lineStyle: { type: 'dashed' as const, color: '#c22f2f' }, symbol: 'none' }] : []),
      ],
    };
  }, [series]);

  const xbarOption = useMemo<EChartsOption | null>(() => {
    if (!analysis?.xr) return null;
    const xr = analysis.xr;
    const mk = (v: number) => Number(v.toFixed(5));
    return {
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      grid: [
        { left: 60, right: 24, top: 36, height: '32%' },
        { left: 60, right: 24, top: '58%', height: '30%' },
      ],
      xAxis: [
        { type: 'category', gridIndex: 0, data: analysis.subgroupLabels, axisLabel: { show: false } },
        { type: 'category', gridIndex: 1, data: analysis.subgroupLabels, axisLabel: { rotate: 35, fontSize: 9 } },
      ],
      yAxis: [
        { type: 'value', gridIndex: 0, scale: true, name: 'X̄' },
        { type: 'value', gridIndex: 1, scale: true, name: 'R' },
      ],
      series: [
        { name: 'X̄', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: xr.xbars.map(mk), symbolSize: 6 },
        { name: 'X̄ UCL', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: xr.xbars.map(() => mk(xr.xbarUCL)), lineStyle: { type: 'dashed', color: '#c22f2f' }, symbol: 'none' },
        { name: 'X̄ CL', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: xr.xbars.map(() => mk(xr.xbarbar)), lineStyle: { type: 'dotted', color: '#1a8a4c' }, symbol: 'none' },
        { name: 'X̄ LCL', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: xr.xbars.map(() => mk(xr.xbarLCL)), lineStyle: { type: 'dashed', color: '#c22f2f' }, symbol: 'none' },
        { name: 'R', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: xr.ranges.map(mk), symbolSize: 6, itemStyle: { color: '#b06a00' } },
        { name: 'R UCL', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: xr.ranges.map(() => mk(xr.rUCL)), lineStyle: { type: 'dashed', color: '#c22f2f' }, symbol: 'none' },
        { name: 'R CL', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: xr.ranges.map(() => mk(xr.rbar)), lineStyle: { type: 'dotted', color: '#1a8a4c' }, symbol: 'none' },
      ],
    };
  }, [analysis]);

  const histOption = useMemo<EChartsOption | null>(() => {
    if (!analysis || analysis.allValues.length < 5) return null;
    const bins = histogram(analysis.allValues);
    const box = boxStats(analysis.allValues);
    return {
      tooltip: {},
      grid: { left: 60, right: 24, top: 32, bottom: 40 },
      xAxis: { type: 'category', data: bins.map((b) => `${b.x0.toFixed(4)}`), axisLabel: { rotate: 35, fontSize: 9 } },
      yAxis: { type: 'value', name: '频数', minInterval: 1 },
      series: [{ name: '频数', type: 'bar', data: bins.map((b) => b.count), barWidth: '92%', itemStyle: { color: '#7fb6d9', borderRadius: [3, 3, 0, 0] } }],
      graphic: [{
        type: 'text', right: 26, top: 30,
        style: {
          text: `Min ${box.min.toFixed(4)}\nQ1 ${box.q1.toFixed(4)}\n中位数 ${box.median.toFixed(4)}\nQ3 ${box.q3.toFixed(4)}\nMax ${box.max.toFixed(4)}`,
          fontSize: 11, fill: '#4a5a6a', lineHeight: 17,
        },
      }],
    };
  }, [analysis]);

  const paretoOption = useMemo<EChartsOption | null>(() => {
    if (!stats?.defectPareto.length) return null;
    const p = pareto(stats.defectPareto);
    return {
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      grid: { left: 48, right: 52, top: 36, bottom: 60 },
      xAxis: { type: 'category', data: p.map((x) => x.name), axisLabel: { rotate: 30, fontSize: 10 } },
      yAxis: [
        { type: 'value', name: '不合格数', minInterval: 1 },
        { type: 'value', name: '累计%', min: 0, max: 100 },
      ],
      series: [
        { name: '不合格数', type: 'bar', data: p.map((x) => x.count), barWidth: 26, itemStyle: { color: '#0e77b4', borderRadius: [4, 4, 0, 0] } },
        { name: '累计百分比', type: 'line', yAxisIndex: 1, data: p.map((x) => x.cumPct), symbolSize: 7, itemStyle: { color: '#b06a00' } },
      ],
    };
  }, [stats]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>SPC 质量报表</h1>
          <div className="sub">
            柏拉图 / PPM / 趋势图 / 单值描点 / Xbar-R 控制图 / 直方图+箱线 / Cp·Cpk·Pp·Ppk
            （公式依据 GB/T 4091《常规控制图》，可用 scripts/verify_spc.py 复现）
          </div>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="grid cols-3">
        <div className="card kpi"><div className="v">{stats ? stats.ppm.toLocaleString() : '—'}</div><div className="l">总体 PPM（不合格品数/受检数×10⁶）</div></div>
        <div className="card kpi"><div className="v">{stats ? `${((stats.passedLots / Math.max(1, stats.inspectedLots)) * 100).toFixed(1)}%` : '—'}</div><div className="l">批合格率</div></div>
        <div className="card kpi"><div className="v">{stats?.inspectedLots ?? '—'}</div><div className="l">已检验批数</div></div>
      </div>

      <div className="card">
        <h2>缺陷柏拉图（全部检验记录聚合）</h2>
        {paretoOption ? <Chart option={paretoOption} height={300} /> : <div className="empty">暂无缺陷数据</div>}
      </div>

      <div className="card">
        <h2>计量数据 SPC 分析</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <select value={materialId} onChange={(e) => { setMaterialId(e.target.value); setItemId(''); }} style={{ maxWidth: 320 }}>
            <option value="">选择物料…</option>
            {materials.map((m) => <option key={m.id} value={m.id}>{m.code} {m.name}</option>)}
          </select>
          <select value={itemId} onChange={(e) => setItemId(e.target.value)} style={{ maxWidth: 320 }} disabled={!quantItems.length}>
            <option value="">选择计量型检验条目…</option>
            {quantItems.map((it) => <option key={it.id} value={it.id}>{it.name}{it.unit ? `（${it.unit}）` : ''}</option>)}
          </select>
        </div>

        {!series ? (
          <div className="empty">选择物料与计量条目后展示分析</div>
        ) : series.groups.length === 0 ? (
          <div className="empty">该条目暂无实测数据</div>
        ) : (
          <>
            {analysis?.cap && (
              <div className="grid cols-4" style={{ marginBottom: 14 }}>
                <div className="card kpi" style={{ marginBottom: 0 }}>
                  <div className="v" style={{ color: (analysis.cap.cpk ?? 99) >= 1.33 ? 'var(--ok)' : 'var(--bad)' }}>{analysis.cap.cpk?.toFixed(3) ?? '—'}</div>
                  <div className="l">Cpk（组内，σ̂=R̄/d₂）{analysis.cap.cp !== undefined && ` · Cp=${analysis.cap.cp.toFixed(3)}`}</div>
                </div>
                <div className="card kpi" style={{ marginBottom: 0 }}>
                  <div className="v" style={{ color: (analysis.cap.ppk ?? 99) >= 1.33 ? 'var(--ok)' : 'var(--bad)' }}>{analysis.cap.ppk?.toFixed(3) ?? '—'}</div>
                  <div className="l">Ppk（整体，样本 s）{analysis.cap.pp !== undefined && ` · Pp=${analysis.cap.pp.toFixed(3)}`}</div>
                </div>
                <div className="card kpi" style={{ marginBottom: 0 }}>
                  <div className="v">{analysis.cap.mean.toFixed(4)}</div>
                  <div className="l">均值 μ（n={analysis.allValues.length}）</div>
                </div>
                <div className="card kpi" style={{ marginBottom: 0 }}>
                  <div className="v">{analysis.cap.sigmaOverall.toFixed(5)}</div>
                  <div className="l">整体标准差 s{analysis.cap.sigmaWithin !== undefined && ` · σ̂within=${analysis.cap.sigmaWithin.toFixed(5)}`}</div>
                </div>
              </div>
            )}
            <div className="grid cols-2">
              <div>
                <h2 style={{ fontSize: 14 }}>批均值趋势图</h2>
                {trendOption && <Chart option={trendOption} height={280} />}
              </div>
              <div>
                <h2 style={{ fontSize: 14 }}>单值描点图</h2>
                {individualsOption && <Chart option={individualsOption} height={280} />}
              </div>
            </div>
            <div className="grid cols-2" style={{ marginTop: 14 }}>
              <div>
                <h2 style={{ fontSize: 14 }}>Xbar-R 控制图（GB/T 4091 系数）</h2>
                {xbarOption ? <Chart option={xbarOption} height={380} /> : <div className="empty">子组数不足（需 ≥2 个等大小子组，子组 2–10）</div>}
              </div>
              <div>
                <h2 style={{ fontSize: 14 }}>直方图 + 箱线五数</h2>
                {histOption ? <Chart option={histOption} height={380} /> : <div className="empty">数据量不足（需 ≥5 个实测值）</div>}
              </div>
            </div>
            <div className="hint" style={{ marginTop: 10, fontSize: 12 }}>
              判定参考：Cpk ≥ 1.33 为过程能力充分（常用要求）；控制图点超出 UCL/LCL 提示过程异常波动。
              计算逻辑与 scripts/verify_spc.py 交叉校验（相同固定数据集两种语言独立计算结果一致）。
            </div>
          </>
        )}
      </div>
    </>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { EChartsOption } from 'echarts';
import type { Stats } from '../api';
import { api } from '../api';
import Chart from '../components/Chart';

/** 可订阅的报表卡片（方案 4.2.1 报表订阅） */
const CARDS = [
  { id: 'month', label: '月度批合格率趋势' },
  { id: 'supplier', label: '供应商批合格率' },
  { id: 'component', label: '检验批次构成' },
  { id: 'kind', label: 'IQC/IPQC/OQC 分布' },
  { id: 'pareto', label: '缺陷柏拉图 TOP' },
  { id: 'cost', label: '质量成本构成' },
] as const;

type CardId = (typeof CARDS)[number]['id'];
const SUB_KEY = 'qms_dashboard_cards';

function loadSubs(): CardId[] {
  try {
    const raw = localStorage.getItem(SUB_KEY);
    if (raw) return JSON.parse(raw) as CardId[];
  } catch { /* 忽略 */ }
  return CARDS.map((c) => c.id);
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [subs, setSubs] = useState<CardId[]>(loadSubs);
  const [editSubs, setEditSubs] = useState(false);

  useEffect(() => {
    api.stats().then(setStats).catch((e) => setError(e.message));
  }, []);

  function toggleSub(id: CardId) {
    const next = subs.includes(id) ? subs.filter((x) => x !== id) : [...subs, id];
    setSubs(next);
    localStorage.setItem(SUB_KEY, JSON.stringify(next));
  }

  const monthOption = useMemo<EChartsOption>(() => {
    if (!stats) return {};
    const months = Object.keys(stats.byMonth).sort();
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['批合格率(%)', '检验批数'], top: 0 },
      grid: { left: 52, right: 52, top: 56, bottom: 28 },
      xAxis: { type: 'category', data: months },
      yAxis: [
        { type: 'value', name: '合格率(%)', min: 0, max: 100, nameGap: 18 },
        { type: 'value', name: '批数', minInterval: 1, nameGap: 18 },
      ],
      series: [
        {
          name: '批合格率(%)', type: 'line', smooth: true, symbolSize: 8, lineStyle: { width: 3 }, itemStyle: { color: '#0e77b4' },
          data: months.map((m) => { const s = stats.byMonth[m]; return s.total ? Number(((s.passed / s.total) * 100).toFixed(1)) : null; }),
        },
        { name: '检验批数', type: 'bar', yAxisIndex: 1, barWidth: 22, itemStyle: { color: '#bcd9ec', borderRadius: [4, 4, 0, 0] }, data: months.map((m) => stats.byMonth[m].total) },
      ],
    };
  }, [stats]);

  const supplierOption = useMemo<EChartsOption>(() => {
    if (!stats) return {};
    const names = Object.keys(stats.bySupplier);
    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          const p = (params as { name: string; value: number }[])[0];
          const s = stats.bySupplier[p.name];
          return `${p.name}<br/>批合格率：${p.value}%（${s.passed}/${s.total} 批）`;
        },
      },
      grid: { left: 8, right: 44, top: 16, bottom: 8, containLabel: true },
      xAxis: { type: 'value', max: 100, axisLabel: { show: false }, splitLine: { show: false } },
      yAxis: { type: 'category', data: names, axisLabel: { width: 150, overflow: 'truncate' } },
      series: [{
        type: 'bar', barWidth: 16,
        data: names.map((n) => { const s = stats.bySupplier[n]; return Number(((s.passed / s.total) * 100).toFixed(1)); }),
        label: { show: true, position: 'right', formatter: '{c}%' },
        itemStyle: {
          borderRadius: [0, 6, 6, 0],
          color: (p: { value?: unknown }) => (Number(p.value) >= 90 ? '#1a8a4c' : Number(p.value) >= 70 ? '#b06a00' : '#c22f2f'),
        },
      }],
    };
  }, [stats]);

  const componentOption = useMemo<EChartsOption>(() => {
    if (!stats) return {};
    return {
      tooltip: { trigger: 'item', formatter: '{b}<br/>检验 {c} 批（{d}%）' },
      legend: { type: 'scroll', bottom: 0 },
      series: [{
        type: 'pie', radius: ['42%', '68%'], center: ['50%', '44%'],
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        data: Object.entries(stats.byComponent).map(([name, v]) => ({ name, value: v.total })),
      }],
    };
  }, [stats]);

  const kindOption = useMemo<EChartsOption>(() => {
    if (!stats) return {};
    const kinds = Object.keys(stats.byKind);
    return {
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      grid: { left: 44, right: 24, top: 40, bottom: 28 },
      xAxis: { type: 'category', data: kinds },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        { name: '接收批', type: 'bar', stack: 't', barWidth: 40, itemStyle: { color: '#1a8a4c' }, data: kinds.map((k) => stats.byKind[k].passed) },
        { name: '拒收批', type: 'bar', stack: 't', barWidth: 40, itemStyle: { color: '#c22f2f', borderRadius: [4, 4, 0, 0] }, data: kinds.map((k) => stats.byKind[k].total - stats.byKind[k].passed) },
      ],
    };
  }, [stats]);

  const paretoOption = useMemo<EChartsOption>(() => {
    if (!stats) return {};
    const sorted = [...stats.defectPareto].sort((a, b) => b.count - a.count).slice(0, 8);
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 44, right: 24, top: 20, bottom: 70 },
      xAxis: { type: 'category', data: sorted.map((x) => x.name), axisLabel: { rotate: 30, fontSize: 10 } },
      yAxis: { type: 'value', minInterval: 1 },
      series: [{ type: 'bar', barWidth: 24, itemStyle: { color: '#0e77b4', borderRadius: [4, 4, 0, 0] }, data: sorted.map((x) => x.count) }],
    };
  }, [stats]);

  const costOption = useMemo<EChartsOption>(() => {
    if (!stats) return {};
    return {
      tooltip: { trigger: 'item', formatter: '{b}<br/>¥{c}（{d}%）' },
      legend: { bottom: 0 },
      series: [{
        type: 'pie', radius: ['40%', '65%'], center: ['50%', '44%'],
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        data: Object.entries(stats.costByType).map(([name, value]) => ({ name, value: Number(value.toFixed(2)) })),
      }],
    };
  }, [stats]);

  if (error) return <div className="alert error">{error}</div>;
  if (!stats) return <div className="empty">加载中…</div>;

  const passRate = stats.inspectedLots ? ((stats.passedLots / stats.inspectedLots) * 100).toFixed(1) : '—';
  const show = (id: CardId) => subs.includes(id);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>质量驾驶舱 · 工作台</h1>
          <div className="sub">执行层 KPI + 订阅式报表（方案 4.2），数据实时来自业务记录</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn no-print" onClick={() => setEditSubs(!editSubs)}>{editSubs ? '完成' : '订阅报表'}</button>
          <Link to="/batches/new" className="btn primary no-print">+ 报检登记</Link>
        </div>
      </div>

      {editSubs && (
        <div className="card no-print">
          <h2>报表订阅（勾选展示在工作台的报表卡片）</h2>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {CARDS.map((c) => (
              <label key={c.id} style={{ fontSize: 13.5 }}>
                <input type="checkbox" checked={show(c.id)} onChange={() => toggleSub(c.id)} /> {c.label}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="grid cols-4">
        <div className="card kpi"><div className="v">{stats.totalBatches}</div><div className="l">累计报检批次</div></div>
        <div className="card kpi warn"><div className="v">{stats.pendingInspection + stats.pendingReview}</div><div className="l">待检验 {stats.pendingInspection} · 待审核 {stats.pendingReview}</div></div>
        <div className={`card kpi ${Number(passRate) >= 90 ? 'ok' : 'bad'}`}><div className="v">{passRate}%</div><div className="l">批合格率（已检 {stats.inspectedLots} 批）</div></div>
        <div className="card kpi"><div className="v">{stats.ppm.toLocaleString()}</div><div className="l">PPM</div></div>
        <div className="card kpi bad"><div className="v">{stats.openNcrs}</div><div className="l">未关闭不合格品</div></div>
        <div className="card kpi bad"><div className="v">{stats.openComplaints}</div><div className="l">未关闭客诉</div></div>
        <div className="card kpi warn"><div className="v">{stats.openCapas}</div><div className="l">进行中 CAPA</div></div>
        <div className="card kpi"><div className="v">¥{Math.round(stats.costTotal).toLocaleString()}</div><div className="l">累计质量成本</div></div>
      </div>

      <div style={{ height: 16 }} />

      {show('month') && (
        <div className="card">
          <h2>月度批合格率趋势</h2>
          <Chart option={monthOption} height={300} />
        </div>
      )}

      <div className="grid cols-2">
        {show('supplier') && (
          <div className="card">
            <h2>供应商批合格率（IQC）</h2>
            {Object.keys(stats.bySupplier).length ? <Chart option={supplierOption} height={280} /> : <div className="empty">暂无检验数据</div>}
          </div>
        )}
        {show('component') && (
          <div className="card">
            <h2>检验批次构成（按物料）</h2>
            {Object.keys(stats.byComponent).length ? <Chart option={componentOption} height={280} /> : <div className="empty">暂无检验数据</div>}
          </div>
        )}
        {show('kind') && (
          <div className="card">
            <h2>IQC / IPQC / OQC 批次分布</h2>
            {Object.keys(stats.byKind).length ? <Chart option={kindOption} height={280} /> : <div className="empty">暂无数据</div>}
          </div>
        )}
        {show('pareto') && (
          <div className="card">
            <h2>缺陷排行 TOP8 <Link to="/spc" style={{ fontSize: 12, fontWeight: 400 }}>完整柏拉图 →</Link></h2>
            {stats.defectPareto.length ? <Chart option={paretoOption} height={280} /> : <div className="empty">暂无缺陷数据</div>}
          </div>
        )}
        {show('cost') && (
          <div className="card">
            <h2>质量成本构成 <Link to="/costs" style={{ fontSize: 12, fontWeight: 400 }}>明细 →</Link></h2>
            {Object.keys(stats.costByType).length ? <Chart option={costOption} height={280} /> : <div className="empty">暂无费用数据</div>}
          </div>
        )}
      </div>
    </>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import Chart from '../components/Chart';

type Stats = Awaited<ReturnType<typeof api.stats>>;

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.stats().then(setStats).catch((e) => setError(e.message));
  }, []);

  const monthOption = useMemo(() => {
    if (!stats) return {};
    const months = Object.keys(stats.byMonth).sort();
    const rates = months.map((m) => {
      const s = stats.byMonth[m];
      return s.total ? Number(((s.passed / s.total) * 100).toFixed(1)) : null;
    });
    const totals = months.map((m) => stats.byMonth[m].total);
    return {
      tooltip: { trigger: 'axis' as const },
      legend: { data: ['批合格率(%)', '检验批数'] },
      grid: { left: 48, right: 48, top: 40, bottom: 28 },
      xAxis: { type: 'category' as const, data: months },
      yAxis: [
        { type: 'value' as const, name: '合格率(%)', min: 0, max: 100 },
        { type: 'value' as const, name: '批数', minInterval: 1 },
      ],
      series: [
        { name: '批合格率(%)', type: 'line' as const, data: rates, smooth: true, symbolSize: 8, lineStyle: { width: 3 }, itemStyle: { color: '#0e77b4' } },
        { name: '检验批数', type: 'bar' as const, yAxisIndex: 1, data: totals, barWidth: 22, itemStyle: { color: '#bcd9ec', borderRadius: [4, 4, 0, 0] } },
      ],
    };
  }, [stats]);

  const supplierOption = useMemo(() => {
    if (!stats) return {};
    const names = Object.keys(stats.bySupplier);
    const rates = names.map((n) => {
      const s = stats.bySupplier[n];
      return Number(((s.passed / s.total) * 100).toFixed(1));
    });
    return {
      tooltip: {
        trigger: 'axis' as const,
        formatter: (params: unknown) => {
          const p = (params as { name: string; value: number; dataIndex: number }[])[0];
          const s = stats.bySupplier[p.name];
          return `${p.name}<br/>批合格率：${p.value}%（${s.passed}/${s.total} 批）`;
        },
      },
      grid: { left: 8, right: 40, top: 16, bottom: 28, containLabel: true },
      xAxis: { type: 'value' as const, max: 100, name: '%' },
      yAxis: { type: 'category' as const, data: names, axisLabel: { width: 150, overflow: 'truncate' as const } },
      series: [{
        type: 'bar' as const,
        data: rates,
        barWidth: 16,
        label: { show: true, position: 'right' as const, formatter: '{c}%' },
        itemStyle: {
          borderRadius: [0, 6, 6, 0],
          color: (p: { value?: unknown }) => (Number(p.value) >= 90 ? '#1a8a4c' : Number(p.value) >= 70 ? '#b06a00' : '#c22f2f'),
        },
      }],
    };
  }, [stats]);

  const componentOption = useMemo(() => {
    if (!stats) return {};
    const names = Object.keys(stats.byComponent);
    return {
      tooltip: { trigger: 'item' as const, formatter: '{b}<br/>检验 {c} 批（{d}%）' },
      legend: { type: 'scroll' as const, bottom: 0 },
      series: [{
        type: 'pie' as const,
        radius: ['42%', '68%'],
        center: ['50%', '44%'],
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        data: names.map((n) => ({ name: n, value: stats.byComponent[n].total })),
      }],
    };
  }, [stats]);

  if (error) return <div className="alert error">{error}</div>;
  if (!stats) return <div className="empty">加载中…</div>;

  const passRate = stats.inspectedLots ? ((stats.passedLots / stats.inspectedLots) * 100).toFixed(1) : '—';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>工作台</h1>
          <div className="sub">换流阀组部件来料检验（IQC）总览 · 数据实时来自检验业务记录</div>
        </div>
        <Link to="/batches/new" className="btn primary no-print">+ 来料登记</Link>
      </div>

      <div className="grid cols-4">
        <div className="card kpi"><div className="v">{stats.totalBatches}</div><div className="l">累计来料批次</div></div>
        <div className="card kpi warn"><div className="v">{stats.pendingInspection}</div><div className="l">待检验批次</div></div>
        <div className="card kpi warn"><div className="v">{stats.pendingReview}</div><div className="l">待审核批次</div></div>
        <div className={`card kpi ${Number(passRate) >= 90 ? 'ok' : 'bad'}`}><div className="v">{passRate}%</div><div className="l">批合格率（已检 {stats.inspectedLots} 批）</div></div>
      </div>

      <div style={{ height: 16 }} />
      <div className="card">
        <h2>月度批合格率趋势</h2>
        <Chart option={monthOption} height={300} />
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>供应商批合格率</h2>
          {Object.keys(stats.bySupplier).length ? <Chart option={supplierOption} height={280} /> : <div className="empty">暂无检验数据</div>}
        </div>
        <div className="card">
          <h2>检验批次构成（按组部件）</h2>
          {Object.keys(stats.byComponent).length ? <Chart option={componentOption} height={280} /> : <div className="empty">暂无检验数据</div>}
        </div>
      </div>
    </>
  );
}

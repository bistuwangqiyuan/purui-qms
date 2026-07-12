import { useCallback, useEffect, useMemo, useState } from 'react';
import type { QualityCost } from '../../shared/types';
import { api } from '../api';
import { useAuth } from '../auth';
import Chart from '../components/Chart';

export default function Costs() {
  const { user } = useAuth();
  const isQe = user?.role === 'qe' || user?.role === 'admin';
  const [costs, setCosts] = useState<QualityCost[]>([]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ typePath: '内部损失/返工', amount: '', bearer: '', note: '', date: new Date().toISOString().slice(0, 10) });

  const load = useCallback(() => {
    api.costs().then(setCosts).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const total = useMemo(() => costs.reduce((a, c) => a + c.amount, 0), [costs]);
  const pieOption = useMemo(() => {
    const byType: Record<string, number> = {};
    for (const c of costs) {
      const top = c.typePath.split('/')[0];
      byType[top] = (byType[top] ?? 0) + c.amount;
    }
    return {
      tooltip: { trigger: 'item' as const, formatter: '{b}<br/>¥{c}（{d}%）' },
      legend: { bottom: 0 },
      series: [{
        type: 'pie' as const, radius: ['40%', '65%'], center: ['50%', '44%'],
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        data: Object.entries(byType).map(([name, value]) => ({ name, value: Number(value.toFixed(2)) })),
      }],
    };
  }, [costs]);

  async function create() {
    setError('');
    try {
      await api.createCost({ typePath: form.typePath, amount: Number(form.amount), bearer: form.bearer || undefined, note: form.note || undefined, date: form.date });
      setCreating(false);
      setForm({ ...form, amount: '', note: '' });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '登记失败');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>质量成本</h1>
          <div className="sub">不合格品/客诉等质量事件费用登记与统计（方案 3.2 表 14 项）</div>
        </div>
        {isQe && <button className="btn primary" onClick={() => setCreating(true)}>+ 登记费用</button>}
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="grid cols-2">
        <div className="card kpi">
          <div className="v">¥{total.toLocaleString()}</div>
          <div className="l">累计质量成本（{costs.length} 笔）</div>
        </div>
        <div className="card">
          <h2>费用类型构成</h2>
          {costs.length ? <Chart option={pieOption} height={220} /> : <div className="empty">暂无数据</div>}
        </div>
      </div>

      <div className="card">
        <table className="tbl">
          <thead><tr><th>日期</th><th>费用类型</th><th className="num">金额(元)</th><th>关联单据</th><th>承担方</th><th>备注</th><th>登记人</th></tr></thead>
          <tbody>
            {costs.map((c) => (
              <tr key={c.id}>
                <td>{c.date}{c.demo && <span className="badge gray" style={{ marginLeft: 6 }}>演示</span>}</td>
                <td>{c.typePath}</td>
                <td className="num">{c.amount.toLocaleString()}</td>
                <td>{c.refNo ?? '—'}</td>
                <td>{c.bearer ?? '—'}</td>
                <td>{c.note ?? '—'}</td>
                <td>{c.createdBy}</td>
              </tr>
            ))}
            {!costs.length && <tr><td colSpan={7}><div className="empty">暂无费用记录</div></td></tr>}
          </tbody>
        </table>
      </div>

      {creating && (
        <div className="modal-mask" onClick={() => setCreating(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>登记质量费用</h2>
            <div className="grid cols-2">
              <div className="field">
                <label>费用类型 *</label>
                <select value={form.typePath} onChange={(e) => setForm({ ...form, typePath: e.target.value })}>
                  {['预防成本/培训', '预防成本/体系维护', '鉴定成本/检验试验', '鉴定成本/量具校准', '内部损失/返工', '内部损失/报废', '内部损失/不合格品处置', '外部损失/客诉处理', '外部损失/退货索赔'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="field"><label>金额（元）*</label><input type="number" min={0.01} step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            </div>
            <div className="grid cols-2">
              <div className="field"><label>日期</label><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <div className="field"><label>承担方</label><input value={form.bearer} onChange={(e) => setForm({ ...form, bearer: e.target.value })} /></div>
            </div>
            <div className="field"><label>备注</label><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
            <div className="actions">
              <button className="btn" onClick={() => setCreating(false)}>取消</button>
              <button className="btn primary" onClick={create}>登记</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

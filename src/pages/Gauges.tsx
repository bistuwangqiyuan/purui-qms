import { useCallback, useEffect, useState } from 'react';
import type { Gauge } from '../../shared/types';
import { api } from '../api';
import { useAuth } from '../auth';

export default function Gauges() {
  const { user } = useAuth();
  const isQe = user?.role === 'qe' || user?.role === 'admin';
  const [gauges, setGauges] = useState<Gauge[]>([]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [calibFor, setCalibFor] = useState<Gauge | null>(null);
  const [form, setForm] = useState({ code: '', name: '', type: '', calibCycleDays: '365', location: '' });
  const [calibNote, setCalibNote] = useState('');

  const load = useCallback(() => {
    api.gauges().then(setGauges).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const today = new Date().toISOString().slice(0, 10);

  async function create() {
    setError('');
    try {
      await api.createGauge({ ...form, calibCycleDays: Number(form.calibCycleDays) });
      setCreating(false);
      setForm({ code: '', name: '', type: '', calibCycleDays: '365', location: '' });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败');
    }
  }

  async function calibrate() {
    if (!calibFor) return;
    setError('');
    try {
      await api.calibrateGauge(calibFor.id, { note: calibNote || undefined });
      setCalibFor(null); setCalibNote('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '登记失败');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>量具管理</h1>
          <div className="sub">量具台账、校准周期与到期提醒（方案 3.2 表 16 项）</div>
        </div>
        {isQe && <button className="btn primary" onClick={() => setCreating(true)}>+ 新建量具</button>}
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <table className="tbl">
          <thead><tr><th>编号</th><th>名称</th><th>类型</th><th>存放位置</th><th className="num">周期(天)</th><th>上次校准</th><th>下次校准</th><th>状态</th><th></th></tr></thead>
          <tbody>
            {gauges.map((g) => {
              const overdue = g.nextCalib && g.nextCalib <= today;
              const soon = !overdue && g.nextCalib && new Date(g.nextCalib).getTime() - Date.now() < 30 * 86400e3;
              return (
                <tr key={g.id}>
                  <td>{g.code}{g.demo && <span className="badge gray" style={{ marginLeft: 6 }}>演示</span>}</td>
                  <td>{g.name}</td>
                  <td>{g.type}</td>
                  <td>{g.location ?? '—'}</td>
                  <td className="num">{g.calibCycleDays}</td>
                  <td>{g.lastCalib ?? '—'}</td>
                  <td>{g.nextCalib ?? '—'}</td>
                  <td>
                    {overdue ? <span className="badge red">校准过期</span> : soon ? <span className="badge amber">30 天内到期</span> : <span className="badge green">正常</span>}
                  </td>
                  <td><button className="btn sm" onClick={() => setCalibFor(g)}>登记校准</button></td>
                </tr>
              );
            })}
            {!gauges.length && <tr><td colSpan={9}><div className="empty">暂无量具台账</div></td></tr>}
          </tbody>
        </table>
      </div>

      {creating && (
        <div className="modal-mask" onClick={() => setCreating(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>新建量具</h2>
            <div className="grid cols-2">
              <div className="field"><label>量具编号 *</label><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
              <div className="field"><label>量具名称 *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            </div>
            <div className="grid cols-2">
              <div className="field"><label>类型</label><input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="长度量具 / 电学仪器 …" /></div>
              <div className="field"><label>校准周期（天）*</label><input type="number" min={1} value={form.calibCycleDays} onChange={(e) => setForm({ ...form, calibCycleDays: e.target.value })} /></div>
            </div>
            <div className="field"><label>存放位置</label><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
            <div className="actions">
              <button className="btn" onClick={() => setCreating(false)}>取消</button>
              <button className="btn primary" onClick={create}>创建</button>
            </div>
          </div>
        </div>
      )}

      {calibFor && (
        <div className="modal-mask" onClick={() => setCalibFor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>登记校准：{calibFor.code} {calibFor.name}</h2>
            <div className="field"><label>校准备注（证书号等）</label><input value={calibNote} onChange={(e) => setCalibNote(e.target.value)} /></div>
            <div className="alert info">登记后下次校准日期自动顺延 {calibFor.calibCycleDays} 天</div>
            <h2 style={{ fontSize: 14 }}>校准履历</h2>
            <ul className="timeline">
              {calibFor.history.slice().reverse().map((h, i) => (
                <li key={i}><div>{h.action}{h.note ? `（${h.note}）` : ''}</div><div className="t">{h.date} · {h.by}</div></li>
              ))}
            </ul>
            <div className="actions">
              <button className="btn" onClick={() => setCalibFor(null)}>取消</button>
              <button className="btn primary" onClick={calibrate}>校准合格</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

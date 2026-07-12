import { useCallback, useEffect, useState } from 'react';
import type { InspectionStandard, Material, PatrolPlan } from '../../shared/types';
import { api } from '../api';
import { useAuth } from '../auth';

export default function PatrolPlans() {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'qe';
  const [plans, setPlans] = useState<PatrolPlan[]>([]);
  const [standards, setStandards] = useState<InspectionStandard[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [editing, setEditing] = useState<Partial<PatrolPlan> | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    Promise.all([api.patrolPlans(), api.standards(), api.materials()])
      .then(([p, s, m]) => { setPlans(p); setStandards(s); setMaterials(m); })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function save() {
    if (!editing) return;
    setError('');
    try {
      await api.savePatrolPlan(editing);
      setEditing(null);
      setOk('巡检计划已保存'); setTimeout(() => setOk(''), 3000);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    }
  }

  async function generate() {
    setBusy(true); setError('');
    try {
      const r = await api.generatePatrol();
      setOk(r.generated.length ? `已生成巡检任务：${r.generated.join('、')}` : '当前无到期的巡检计划');
      setTimeout(() => setOk(''), 5000);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>巡检计划</h1>
          <div className="sub">按间隔自动生成 IPQC 巡检任务并通知检验员（方案 4.3.3）</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={generate} disabled={busy}>{busy ? '生成中…' : '生成到期任务'}</button>
          {canEdit && <button className="btn primary" onClick={() => setEditing({ intervalHours: 4, active: true })}>+ 新建计划</button>}
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {ok && <div className="alert ok">{ok}</div>}
      <div className="alert info">
        说明：Serverless 平台无常驻定时器，进入本页或点击"生成到期任务"时自动检查并生成到期任务（README 已注明该实现方式）。
      </div>

      <div className="card">
        <table className="tbl">
          <thead><tr><th>计划名称</th><th>产线</th><th>工序</th><th className="num">间隔(h)</th><th>检验标准</th><th>上次生成</th><th>状态</th>{canEdit && <th></th>}</tr></thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.line}</td>
                <td>{p.process || '—'}</td>
                <td className="num">{p.intervalHours}</td>
                <td>{standards.find((s) => s.id === p.standardId)?.name ?? '—'}</td>
                <td>{p.lastGeneratedAt ? new Date(p.lastGeneratedAt).toLocaleString('zh-CN') : '—'}</td>
                <td>{p.active ? <span className="badge green">启用</span> : <span className="badge gray">停用</span>}</td>
                {canEdit && (
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn sm" onClick={() => setEditing({ ...p })}>编辑</button>{' '}
                    <button className="btn sm" onClick={async () => { await api.savePatrolPlan({ ...p, active: !p.active }); load(); }}>
                      {p.active ? '停用' : '启用'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {!plans.length && <tr><td colSpan={8}><div className="empty">暂无巡检计划</div></td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="modal-mask" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editing.id ? '编辑' : '新建'}巡检计划</h2>
            <div className="field"><label>计划名称 *</label><input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
            <div className="grid cols-2">
              <div className="field"><label>产线 *</label><input value={editing.line ?? ''} onChange={(e) => setEditing({ ...editing, line: e.target.value })} /></div>
              <div className="field"><label>工序</label><input value={editing.process ?? ''} onChange={(e) => setEditing({ ...editing, process: e.target.value })} /></div>
            </div>
            <div className="grid cols-2">
              <div className="field">
                <label>巡检间隔（小时）*</label>
                <input type="number" min={0.5} step={0.5} value={editing.intervalHours ?? 4} onChange={(e) => setEditing({ ...editing, intervalHours: Number(e.target.value) })} />
              </div>
              <div className="field">
                <label>关联物料（可选）</label>
                <select
                  value={editing.materialId ?? ''}
                  onChange={(e) => {
                    const m = materials.find((x) => x.id === e.target.value);
                    setEditing({ ...editing, materialId: m?.id, materialName: m?.name });
                  }}
                >
                  <option value="">不关联</option>
                  {materials.map((m) => <option key={m.id} value={m.id}>{m.code} {m.name}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>检验标准 *</label>
              <select value={editing.standardId ?? ''} onChange={(e) => setEditing({ ...editing, standardId: e.target.value })}>
                <option value="">请选择…</option>
                {standards.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.code} {s.name}</option>)}
              </select>
            </div>
            <div className="actions">
              <button className="btn" onClick={() => setEditing(null)}>取消</button>
              <button className="btn primary" onClick={save}>保存</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

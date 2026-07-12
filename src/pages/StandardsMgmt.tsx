import { useCallback, useEffect, useState } from 'react';
import type { InspectionStandard, StandardItem } from '../../shared/types';
import { api } from '../api';
import { useAuth } from '../auth';

const EMPTY_ITEM = (): StandardItem => ({
  id: '',
  name: '',
  method: '目视检查',
  requirement: '',
  kind: 'qualitative',
  basis: '产品技术规格书',
});

export default function StandardsMgmt() {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'qe';
  const [standards, setStandards] = useState<InspectionStandard[]>([]);
  const [editing, setEditing] = useState<Partial<InspectionStandard> | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const load = useCallback(() => {
    api.standards().then(setStandards).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function save() {
    if (!editing) return;
    setError('');
    try {
      await api.saveStandard(editing);
      setEditing(null);
      setOk('检验标准已保存');
      setTimeout(() => setOk(''), 3000);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    }
  }

  function updateItem(idx: number, patch: Partial<StandardItem>) {
    if (!editing) return;
    const items = [...(editing.items ?? [])];
    items[idx] = { ...items[idx], ...patch };
    setEditing({ ...editing, items });
  }

  const s = editing;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>物料检验标准</h1>
          <div className="sub">检验标准电子化：抽样方案（AQL/固定/百分比）、计数/计量条目、公差与预警值、特殊特性、跳检规则</div>
        </div>
        {canEdit && (
          <button
            className="btn primary"
            onClick={() =>
              setEditing({
                code: '', name: '', sampling: { mode: 'aql', aql: 1.0 },
                items: [EMPTY_ITEM()], active: true, autoApprovePass: false,
                skipRule: { enabled: false, consecutivePass: 5, skipOneOf: 3 },
              })
            }
          >
            + 新建标准
          </button>
        )}
      </div>

      {error && !editing && <div className="alert error">{error}</div>}
      {ok && <div className="alert ok">{ok}</div>}

      <div className="card">
        <table className="tbl">
          <thead>
            <tr><th>编号</th><th>名称</th><th>抽样方式</th><th className="num">条目数</th><th>跳检</th><th>免审批</th><th>状态</th>{canEdit && <th></th>}</tr>
          </thead>
          <tbody>
            {standards.map((st) => (
              <tr key={st.id}>
                <td>{st.code}{st.demo && <span className="badge gray" style={{ marginLeft: 6 }}>演示</span>}</td>
                <td>{st.name}</td>
                <td>
                  {st.sampling.mode === 'aql' && <span className="badge blue">AQL {st.sampling.aql}</span>}
                  {st.sampling.mode === 'fixed' && <span className="badge violet">固定 n={st.sampling.fixedN}</span>}
                  {st.sampling.mode === 'percent' && <span className="badge violet">{st.sampling.percent}%</span>}
                </td>
                <td className="num">{st.items.length}</td>
                <td>{st.skipRule?.enabled ? <span className="badge green">连续{st.skipRule.consecutivePass}批</span> : '—'}</td>
                <td>{st.autoApprovePass ? <span className="badge green">是</span> : '否'}</td>
                <td>{st.active ? <span className="badge green">启用</span> : <span className="badge gray">停用</span>}</td>
                {canEdit && <td><button className="btn sm" onClick={() => setEditing(JSON.parse(JSON.stringify(st)))}>编辑</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {s && (
        <div className="modal-mask" onClick={() => setEditing(null)}>
          <div className="modal" style={{ maxWidth: 960 }} onClick={(e) => e.stopPropagation()}>
            <h2>{s.id ? '编辑' : '新建'}检验标准</h2>
            {error && <div className="alert error">{error}</div>}
            <div className="grid cols-2">
              <div className="field"><label>标准编号 *</label><input value={s.code ?? ''} onChange={(e) => setEditing({ ...s, code: e.target.value })} /></div>
              <div className="field"><label>标准名称 *</label><input value={s.name ?? ''} onChange={(e) => setEditing({ ...s, name: e.target.value })} /></div>
            </div>
            <div className="field"><label>说明</label><input value={s.description ?? ''} onChange={(e) => setEditing({ ...s, description: e.target.value })} /></div>

            <h2 style={{ fontSize: 14 }}>抽样方案</h2>
            <div className="grid cols-4">
              <div className="field">
                <label>抽样方式 *</label>
                <select
                  value={s.sampling?.mode ?? 'aql'}
                  onChange={(e) => setEditing({ ...s, sampling: { ...(s.sampling ?? { mode: 'aql' }), mode: e.target.value as 'aql' | 'fixed' | 'percent' } })}
                >
                  <option value="aql">AQL（GB/T 2828.1）</option>
                  <option value="fixed">固定数量</option>
                  <option value="percent">百分比</option>
                </select>
              </div>
              {s.sampling?.mode === 'aql' && (
                <div className="field">
                  <label>AQL 值 *</label>
                  <select value={String(s.sampling.aql ?? 1.0)} onChange={(e) => setEditing({ ...s, sampling: { ...s.sampling!, aql: Number(e.target.value) } })}>
                    {[0.065, 0.1, 0.15, 0.25, 0.4, 0.65, 1.0, 1.5, 2.5, 4.0, 6.5].map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              )}
              {s.sampling?.mode === 'fixed' && (
                <>
                  <div className="field"><label>样本量 n *</label><input type="number" min={1} value={s.sampling.fixedN ?? ''} onChange={(e) => setEditing({ ...s, sampling: { ...s.sampling!, fixedN: Number(e.target.value) } })} /></div>
                  <div className="field"><label>接收数 Ac</label><input type="number" min={0} value={s.sampling.fixedAc ?? 0} onChange={(e) => setEditing({ ...s, sampling: { ...s.sampling!, fixedAc: Number(e.target.value) } })} /></div>
                </>
              )}
              {s.sampling?.mode === 'percent' && (
                <>
                  <div className="field"><label>抽样比例 % *</label><input type="number" min={0.1} max={100} step="any" value={s.sampling.percent ?? ''} onChange={(e) => setEditing({ ...s, sampling: { ...s.sampling!, percent: Number(e.target.value) } })} /></div>
                  <div className="field"><label>接收数 Ac</label><input type="number" min={0} value={s.sampling.percentAc ?? 0} onChange={(e) => setEditing({ ...s, sampling: { ...s.sampling!, percentAc: Number(e.target.value) } })} /></div>
                </>
              )}
            </div>

            <div className="grid cols-2">
              <div className="field">
                <label>跳检规则（GB/T 2828.1 转移规则简化）</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontWeight: 400, fontSize: 13 }}>
                    <input type="checkbox" checked={s.skipRule?.enabled ?? false}
                      onChange={(e) => setEditing({ ...s, skipRule: { ...(s.skipRule ?? { consecutivePass: 5, skipOneOf: 3 }), enabled: e.target.checked } })} /> 启用
                  </label>
                  连续 <input type="number" min={2} style={{ width: 70 }} value={s.skipRule?.consecutivePass ?? 5}
                    onChange={(e) => setEditing({ ...s, skipRule: { ...(s.skipRule ?? { enabled: false, skipOneOf: 3 }), enabled: s.skipRule?.enabled ?? false, consecutivePass: Number(e.target.value), skipOneOf: s.skipRule?.skipOneOf ?? 3 } })} />
                  批接收后，每 <input type="number" min={2} style={{ width: 70 }} value={s.skipRule?.skipOneOf ?? 3}
                    onChange={(e) => setEditing({ ...s, skipRule: { ...(s.skipRule ?? { enabled: false, consecutivePass: 5 }), enabled: s.skipRule?.enabled ?? false, consecutivePass: s.skipRule?.consecutivePass ?? 5, skipOneOf: Number(e.target.value) } })} />
                  批实检 1 批
                </div>
              </div>
              <div className="field">
                <label>检验设置</label>
                <label style={{ fontWeight: 400, fontSize: 13 }}>
                  <input type="checkbox" checked={s.autoApprovePass ?? false} onChange={(e) => setEditing({ ...s, autoApprovePass: e.target.checked })} /> 合格批自动批准（免审批）
                </label>
                <label style={{ fontWeight: 400, fontSize: 13 }}>
                  <input type="checkbox" checked={s.active ?? true} onChange={(e) => setEditing({ ...s, active: e.target.checked })} /> 启用本标准
                </label>
              </div>
            </div>

            <h2 style={{ fontSize: 14 }}>检验条目（{s.items?.length ?? 0}）</h2>
            {(s.items ?? []).map((it, i) => (
              <div className="item-block" key={i}>
                <div className="grid cols-4">
                  <div className="field"><label>条目名称 *</label><input value={it.name} onChange={(e) => updateItem(i, { name: e.target.value })} /></div>
                  <div className="field">
                    <label>类型</label>
                    <select value={it.kind} onChange={(e) => updateItem(i, { kind: e.target.value as 'quantitative' | 'qualitative' })}>
                      <option value="qualitative">计数型（定性）</option>
                      <option value="quantitative">计量型（定量）</option>
                    </select>
                  </div>
                  <div className="field"><label>检验方法</label><input value={it.method} onChange={(e) => updateItem(i, { method: e.target.value })} /></div>
                  <div className="field">
                    <label>特殊特性</label>
                    <label style={{ fontWeight: 400, fontSize: 13 }}>
                      <input type="checkbox" checked={it.special ?? false} onChange={(e) => updateItem(i, { special: e.target.checked })} /> 关键/重要特性
                    </label>
                  </div>
                </div>
                <div className="field"><label>技术要求 *</label><input value={it.requirement} onChange={(e) => updateItem(i, { requirement: e.target.value })} /></div>
                {it.kind === 'quantitative' && (
                  <div className="grid cols-4">
                    <div className="field"><label>单位</label><input value={it.unit ?? ''} onChange={(e) => updateItem(i, { unit: e.target.value })} /></div>
                    <div className="field"><label>下限 LSL</label><input type="number" step="any" value={it.min ?? ''} onChange={(e) => updateItem(i, { min: e.target.value === '' ? undefined : Number(e.target.value) })} /></div>
                    <div className="field"><label>上限 USL</label><input type="number" step="any" value={it.max ?? ''} onChange={(e) => updateItem(i, { max: e.target.value === '' ? undefined : Number(e.target.value) })} /></div>
                    <div className="field">
                      <label>预警值（下/上）</label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input type="number" step="any" placeholder="warnMin" value={it.warnMin ?? ''} onChange={(e) => updateItem(i, { warnMin: e.target.value === '' ? undefined : Number(e.target.value) })} />
                        <input type="number" step="any" placeholder="warnMax" value={it.warnMax ?? ''} onChange={(e) => updateItem(i, { warnMax: e.target.value === '' ? undefined : Number(e.target.value) })} />
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid cols-2">
                  <div className="field"><label>判定依据</label><input value={it.basis} onChange={(e) => updateItem(i, { basis: e.target.value })} /></div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 14 }}>
                    <button className="btn sm danger" onClick={() => setEditing({ ...s, items: s.items!.filter((_, x) => x !== i) })}>删除条目</button>
                  </div>
                </div>
              </div>
            ))}
            <button className="btn" onClick={() => setEditing({ ...s, items: [...(s.items ?? []), EMPTY_ITEM()] })}>+ 添加条目</button>

            <div className="actions">
              <button className="btn" onClick={() => setEditing(null)}>取消</button>
              <button className="btn primary" onClick={save}>保存标准</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

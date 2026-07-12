import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Ncr } from '../../shared/types';
import { NCR_STATUS_NAMES, SEVERITY_NAMES } from '../../shared/types';
import { api } from '../api';
import { useAuth } from '../auth';

export default function Ncrs() {
  const { user } = useAuth();
  const isInternal = (user?.userType ?? 'internal') === 'internal';
  const canCreate = isInternal && user?.role !== 'qe' ? true : isInternal;
  const [list, setList] = useState<Ncr[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ materialName: '', supplier: '', qty: '1', defectDesc: '', severity: 'Ma' });

  const load = useCallback(() => {
    api.ncrs().then(setList).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function create() {
    setError('');
    try {
      await api.createNcr({
        materialName: form.materialName,
        supplier: form.supplier || undefined,
        qty: Number(form.qty),
        defectDesc: form.defectDesc,
        severity: form.severity as Ncr['severity'],
      });
      setCreating(false);
      setForm({ materialName: '', supplier: '', qty: '1', defectDesc: '', severity: 'Ma' });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '登记失败');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isInternal ? '不合格品管理' : '不合格品通报'}</h1>
          <div className="sub">来料/过程/出货/客诉不合格品登记与 MRB 处置，闭环到 CAPA</div>
        </div>
        {canCreate && isInternal && <button className="btn primary" onClick={() => setCreating(true)}>+ 手动登记</button>}
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        {!list ? (
          <div className="empty">加载中…</div>
        ) : list.length === 0 ? (
          <div className="empty">暂无不合格品记录</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>单号</th><th>来源</th><th>物料/产品</th><th>供应商</th><th className="num">数量</th><th>严重度</th><th>处置</th><th>状态</th><th></th></tr>
            </thead>
            <tbody>
              {list.map((n) => (
                <tr key={n.id}>
                  <td><Link to={`/ncrs/${n.id}`}>{n.no}</Link>{n.demo && <span className="badge gray" style={{ marginLeft: 6 }}>演示</span>}</td>
                  <td><span className="badge blue">{n.source}</span></td>
                  <td>{n.materialName}</td>
                  <td>{n.supplier ?? '—'}</td>
                  <td className="num">{n.qty}</td>
                  <td>{n.severity ? <span className={`badge ${n.severity === 'Cr' ? 'red' : n.severity === 'Ma' ? 'amber' : 'gray'}`}>{SEVERITY_NAMES[n.severity]}</span> : '—'}</td>
                  <td>{n.disposition ? { return: '退货', rework: '返修', sort: '全检挑选', concession: '让步接收', scrap: '报废' }[n.disposition] : '—'}</td>
                  <td><span className={`badge ${n.status === 'closed' ? 'green' : n.status === 'processing' ? 'amber' : 'red'}`}>{NCR_STATUS_NAMES[n.status]}</span></td>
                  <td><Link to={`/ncrs/${n.id}`} className="btn sm">查看</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && (
        <div className="modal-mask" onClick={() => setCreating(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>手动登记不合格品</h2>
            <div className="field"><label>物料/产品名称 *</label><input value={form.materialName} onChange={(e) => setForm({ ...form, materialName: e.target.value })} /></div>
            <div className="grid cols-2">
              <div className="field"><label>供应商</label><input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></div>
              <div className="field"><label>不合格数量 *</label><input type="number" min={1} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} /></div>
            </div>
            <div className="field">
              <label>严重度</label>
              <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                <option value="Cr">致命缺陷 Cr</option>
                <option value="Ma">严重缺陷 Ma</option>
                <option value="Mi">轻微缺陷 Mi</option>
              </select>
            </div>
            <div className="field"><label>不合格描述 *</label><textarea rows={3} value={form.defectDesc} onChange={(e) => setForm({ ...form, defectDesc: e.target.value })} /></div>
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

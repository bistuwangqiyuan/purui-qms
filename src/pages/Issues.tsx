import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Issue } from '../../shared/types';
import { api } from '../api';
import { useAuth } from '../auth';

const STATUS_LABEL: Record<string, string> = { open: '待处理', processing: '处理中', closed: '已关闭' };

export default function Issues() {
  const { user } = useAuth();
  const isQe = user?.role === 'qe' || user?.role === 'admin';
  const [list, setList] = useState<Issue[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ typePath: '现场问题/其他', desc: '', owner: '' });
  const [actionFor, setActionFor] = useState<Issue | null>(null);
  const [note, setNote] = useState('');
  const [startCapa, setStartCapa] = useState(false);
  const [close, setClose] = useState(false);

  const load = useCallback(() => {
    api.issues().then(setList).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function create() {
    setError('');
    try {
      await api.createIssue({ typePath: form.typePath, desc: form.desc, owner: form.owner || undefined });
      setCreating(false);
      setForm({ typePath: '现场问题/其他', desc: '', owner: '' });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '登记失败');
    }
  }

  async function doAction() {
    if (!actionFor) return;
    setError('');
    try {
      await api.issueAction(actionFor.id, { note: note || undefined, startCapa, close });
      setActionFor(null); setNote(''); setStartCapa(false); setClose(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>问题发现</h1>
          <div className="sub">评审/分层审核/手动创建的问题记录，可转 CAR 整改（方案 3.2 表 11 项）</div>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}>+ 登记问题</button>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        {!list ? (
          <div className="empty">加载中…</div>
        ) : list.length === 0 ? (
          <div className="empty">暂无问题记录</div>
        ) : (
          <table className="tbl">
            <thead><tr><th>编号</th><th>类型</th><th>来源</th><th>描述</th><th>负责人</th><th>整改</th><th>状态</th>{isQe && <th></th>}</tr></thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id}>
                  <td>{i.no}{i.demo && <span className="badge gray" style={{ marginLeft: 6 }}>演示</span>}</td>
                  <td>{i.typePath}</td>
                  <td><span className="badge blue">{i.source}</span></td>
                  <td style={{ maxWidth: 360 }}>{i.desc}</td>
                  <td>{i.owner ?? '—'}</td>
                  <td>{i.carId ? <Link to={`/capa/${i.carId}`}>CAPA</Link> : '—'}</td>
                  <td><span className={`badge ${i.status === 'closed' ? 'green' : i.status === 'processing' ? 'amber' : 'red'}`}>{STATUS_LABEL[i.status]}</span></td>
                  {isQe && <td>{i.status !== 'closed' && <button className="btn sm" onClick={() => setActionFor(i)}>处理</button>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && (
        <div className="modal-mask" onClick={() => setCreating(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>登记问题</h2>
            <div className="grid cols-2">
              <div className="field"><label>问题类型</label><input value={form.typePath} onChange={(e) => setForm({ ...form, typePath: e.target.value })} /></div>
              <div className="field"><label>负责人</label><input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} /></div>
            </div>
            <div className="field"><label>问题描述 *</label><textarea rows={3} value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} /></div>
            <div className="actions">
              <button className="btn" onClick={() => setCreating(false)}>取消</button>
              <button className="btn primary" onClick={create}>登记</button>
            </div>
          </div>
        </div>
      )}

      {actionFor && (
        <div className="modal-mask" onClick={() => setActionFor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>处理问题 {actionFor.no}</h2>
            <div className="field"><label>处理记录</label><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <label style={{ fontSize: 13 }}><input type="checkbox" checked={startCapa} onChange={(e) => setStartCapa(e.target.checked)} disabled={!!actionFor.carId} /> 发起 CAR 整改</label>{' '}
            <label style={{ fontSize: 13 }}><input type="checkbox" checked={close} onChange={(e) => setClose(e.target.checked)} /> 关闭问题</label>
            <div className="actions">
              <button className="btn" onClick={() => setActionFor(null)}>取消</button>
              <button className="btn primary" onClick={doAction}>提交</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

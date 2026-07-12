import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Capa, CapaStatus } from '../../shared/types';
import { CAPA_STATUS_NAMES } from '../../shared/types';
import { api } from '../api';
import { useAuth } from '../auth';

const STATUS_COLOR: Record<CapaStatus, string> = {
  open: 'red', analyzing: 'amber', implementing: 'blue', verifying: 'violet', closed: 'green',
};

export function Capas() {
  const { user } = useAuth();
  const userType = user?.userType ?? 'internal';
  const isQe = userType === 'internal' && (user?.role === 'qe' || user?.role === 'admin');
  const [list, setList] = useState<Capa[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', owner: '', dueDate: '', d2Problem: '' });

  const load = useCallback(() => {
    api.capas().then(setList).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function create() {
    setError('');
    try {
      await api.createCapa({ title: form.title, owner: form.owner || undefined, dueDate: form.dueDate || undefined, d2Problem: form.d2Problem || undefined });
      setCreating(false);
      setForm({ title: '', owner: '', dueDate: '', d2Problem: '' });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{userType === 'supplier' ? '整改任务' : 'CAPA 纠正预防'}</h1>
          <div className="sub">CAR/SCAR 整改跟踪，8D 报告自动生成（方案 4.9）</div>
        </div>
        {isQe && <button className="btn primary" onClick={() => setCreating(true)}>+ 发起整改</button>}
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        {!list ? (
          <div className="empty">加载中…</div>
        ) : list.length === 0 ? (
          <div className="empty">暂无整改单</div>
        ) : (
          <table className="tbl">
            <thead><tr><th>单号</th><th>主题</th><th>来源</th><th>责任人</th><th>供应商</th><th>要求完成</th><th>状态</th><th></th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/capa/${c.id}`}>{c.no}</Link>{c.demo && <span className="badge gray" style={{ marginLeft: 6 }}>演示</span>}</td>
                  <td>{c.title}</td>
                  <td><span className="badge blue">{c.source}</span>{c.refNo && ` ${c.refNo}`}</td>
                  <td>{c.owner}</td>
                  <td>{c.supplierName ?? '—'}</td>
                  <td>{c.dueDate ?? '—'}</td>
                  <td><span className={`badge ${STATUS_COLOR[c.status]}`}>{CAPA_STATUS_NAMES[c.status]}</span></td>
                  <td><Link to={`/capa/${c.id}`} className="btn sm">查看</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && (
        <div className="modal-mask" onClick={() => setCreating(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>发起整改（CAR）</h2>
            <div className="field"><label>整改主题 *</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="grid cols-2">
              <div className="field"><label>责任人</label><input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} /></div>
              <div className="field"><label>要求完成日期</label><input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
            </div>
            <div className="field"><label>问题描述（D2）</label><textarea rows={3} value={form.d2Problem} onChange={(e) => setForm({ ...form, d2Problem: e.target.value })} /></div>
            <div className="actions">
              <button className="btn" onClick={() => setCreating(false)}>取消</button>
              <button className="btn primary" onClick={create}>发起</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const D_FIELDS: { key: keyof Capa; label: string; hint: string }[] = [
  { key: 'd1Team', label: 'D1 成立小组', hint: '小组成员与职责' },
  { key: 'd2Problem', label: 'D2 问题描述', hint: '5W2H 描述问题' },
  { key: 'd3Containment', label: 'D3 临时围堵措施', hint: '隔离、拦截、临时处置' },
  { key: 'd4RootCause', label: 'D4 根本原因分析', hint: '5Why / 鱼骨图分析结论' },
  { key: 'd5Corrective', label: 'D5 纠正措施', hint: '针对根因的永久措施' },
  { key: 'd6Implementation', label: 'D6 措施实施与验证', hint: '实施情况与有效性验证' },
  { key: 'd7Prevention', label: 'D7 预防措施', hint: '标准化、水平展开' },
  { key: 'd8Closure', label: 'D8 总结关闭', hint: '经验总结与团队认可' },
];

export function CapaDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const userType = user?.userType ?? 'internal';
  const isQe = userType === 'internal' && (user?.role === 'qe' || user?.role === 'admin');
  const canEdit = userType !== 'customer';
  const [c, setC] = useState<Capa | null>(null);
  const [draft, setDraft] = useState<Partial<Capa>>({});
  const [statusNote, setStatusNote] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (id) api.capa(id).then((x) => { setC(x); setDraft({}); }).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  async function save(nextStatus?: CapaStatus) {
    if (!id) return;
    setBusy(true); setError('');
    try {
      await api.updateCapa(id, { ...draft, status: nextStatus, statusNote: statusNote || undefined });
      setStatusNote('');
      setOk('已保存'); setTimeout(() => setOk(''), 2500);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }

  if (error && !c) return <div className="alert error">{error}</div>;
  if (!c) return <div className="empty">加载中…</div>;

  const NEXT: Record<CapaStatus, CapaStatus | null> = {
    open: 'analyzing', analyzing: 'implementing', implementing: 'verifying', verifying: 'closed', closed: null,
  };
  const next = NEXT[c.status];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>整改单 {c.no} {c.demo && <span className="badge gray">演示数据</span>}</h1>
          <div className="sub">
            <Link to="/capa">← 返回列表</Link>　状态：
            <span className={`badge ${STATUS_COLOR[c.status]}`}>{CAPA_STATUS_NAMES[c.status]}</span>
          </div>
        </div>
        <button className="btn no-print" onClick={() => window.print()}>打印 8D 报告</button>
      </div>

      <div className="card">
        <h2>8D 报告 · {c.title}</h2>
        <div className="grid cols-4">
          <div><div className="hint">来源</div>{c.source}{c.refNo && ` / ${c.refNo}`}</div>
          <div><div className="hint">责任人</div>{c.owner}</div>
          <div><div className="hint">供应商</div>{c.supplierName ?? '—'}</div>
          <div><div className="hint">要求完成</div>{c.dueDate ?? '—'}</div>
        </div>
        <div style={{ marginTop: 12 }}>
          {D_FIELDS.map((f) => (
            <div className="field" key={f.key}>
              <label>{f.label}<span className="hint" style={{ fontWeight: 400, marginLeft: 8 }}>{f.hint}</span></label>
              {canEdit && c.status !== 'closed' ? (
                <textarea
                  rows={2}
                  value={(draft[f.key] as string) ?? (c[f.key] as string) ?? ''}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                />
              ) : (
                <div style={{ padding: '6px 2px', fontSize: 13.5 }}>{(c[f.key] as string) || '—'}</div>
              )}
            </div>
          ))}
        </div>
        {canEdit && c.status !== 'closed' && (
          <div className="no-print">
            {error && <div className="alert error">{error}</div>}
            {ok && <div className="alert ok">{ok}</div>}
            <div className="field"><label>进展说明</label><input value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="记录本次更新的进展（写入流转记录）" /></div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn primary" onClick={() => save()} disabled={busy}>保存内容</button>
              {next && (isQe || next !== 'closed') && (
                <button className="btn" onClick={() => save(next)} disabled={busy}>
                  推进到「{CAPA_STATUS_NAMES[next]}」
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2>流转记录</h2>
        <ul className="timeline">
          {c.history.map((h, i) => (
            <li key={i}>
              <div>{h.action}{h.note ? `（${h.note}）` : ''}</div>
              <div className="t">{new Date(h.at).toLocaleString('zh-CN')} · {h.byName}</div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

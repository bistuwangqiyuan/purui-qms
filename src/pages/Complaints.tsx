import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Complaint } from '../../shared/types';
import { SEVERITY_NAMES } from '../../shared/types';
import { api } from '../api';
import { useAuth } from '../auth';

const STATUS_LABEL: Record<string, string> = { open: '待处理', processing: '处理中', closed: '已关闭' };

export function Complaints() {
  const { user } = useAuth();
  const userType = user?.userType ?? 'internal';
  const [list, setList] = useState<Complaint[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ customerName: '', typePath: '产品质量/性能异常', severity: 'Ma', priority: '中', desc: '', productInfo: '' });

  const load = useCallback(() => {
    api.complaints().then(setList).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function create() {
    setError('');
    try {
      await api.createComplaint({
        customerName: form.customerName || undefined,
        typePath: form.typePath,
        severity: form.severity as Complaint['severity'],
        priority: form.priority as Complaint['priority'],
        desc: form.desc,
        productInfo: form.productInfo || undefined,
      });
      setCreating(false);
      setForm({ customerName: '', typePath: '产品质量/性能异常', severity: 'Ma', priority: '中', desc: '', productInfo: '' });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '登记失败');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{userType === 'customer' ? '我的投诉' : '客户投诉'}</h1>
          <div className="sub">客诉登记 → 处理 → 关联不合格品/CAPA → 关闭（方案 4.8）</div>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}>+ 登记投诉</button>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        {!list ? (
          <div className="empty">加载中…</div>
        ) : list.length === 0 ? (
          <div className="empty">暂无客诉记录</div>
        ) : (
          <table className="tbl">
            <thead><tr><th>单号</th><th>客户</th><th>类型</th><th>优先级</th><th>严重度</th><th>负责人</th><th>状态</th><th></th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/complaints/${c.id}`}>{c.no}</Link>{c.demo && <span className="badge gray" style={{ marginLeft: 6 }}>演示</span>}</td>
                  <td>{c.customerName}</td>
                  <td>{c.typePath}</td>
                  <td><span className={`badge ${c.priority === '高' ? 'red' : c.priority === '中' ? 'amber' : 'gray'}`}>{c.priority}</span></td>
                  <td>{SEVERITY_NAMES[c.severity]}</td>
                  <td>{c.owner ?? '—'}</td>
                  <td><span className={`badge ${c.status === 'closed' ? 'green' : c.status === 'processing' ? 'amber' : 'red'}`}>{STATUS_LABEL[c.status]}</span></td>
                  <td><Link to={`/complaints/${c.id}`} className="btn sm">查看</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && (
        <div className="modal-mask" onClick={() => setCreating(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>登记客户投诉</h2>
            {userType === 'internal' && (
              <div className="field"><label>客户名称 *</label><input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></div>
            )}
            <div className="grid cols-2">
              <div className="field"><label>投诉类型</label><input value={form.typePath} onChange={(e) => setForm({ ...form, typePath: e.target.value })} placeholder="如：产品质量/性能异常" /></div>
              <div className="field"><label>涉及产品</label><input value={form.productInfo} onChange={(e) => setForm({ ...form, productInfo: e.target.value })} /></div>
            </div>
            <div className="grid cols-2">
              <div className="field">
                <label>严重度</label>
                <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                  <option value="Cr">致命 Cr</option><option value="Ma">严重 Ma</option><option value="Mi">轻微 Mi</option>
                </select>
              </div>
              <div className="field">
                <label>优先级</label>
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option>高</option><option>中</option><option>低</option>
                </select>
              </div>
            </div>
            <div className="field"><label>问题描述 *</label><textarea rows={3} value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} /></div>
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

export function ComplaintDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isQe = (user?.userType ?? 'internal') === 'internal' && (user?.role === 'qe' || user?.role === 'admin');
  const [c, setC] = useState<Complaint | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [cost, setCost] = useState('');
  const [registerNcr, setRegisterNcr] = useState(false);
  const [startCapa, setStartCapa] = useState(false);
  const [close, setClose] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (id) api.complaint(id).then(setC).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  async function submit() {
    if (!id) return;
    setBusy(true); setError('');
    try {
      await api.complaintAction(id, {
        note: note || undefined,
        cost: cost ? Number(cost) : undefined,
        registerNcr, startCapa, close,
      });
      setNote(''); setCost(''); setRegisterNcr(false); setStartCapa(false); setClose(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败');
    } finally {
      setBusy(false);
    }
  }

  if (error && !c) return <div className="alert error">{error}</div>;
  if (!c) return <div className="empty">加载中…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>客诉 {c.no} {c.demo && <span className="badge gray">演示数据</span>}</h1>
          <div className="sub">
            <Link to="/complaints">← 返回列表</Link>　状态：
            <span className={`badge ${c.status === 'closed' ? 'green' : 'amber'}`}>{STATUS_LABEL[c.status]}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>投诉信息</h2>
        <div className="grid cols-4">
          <div><div className="hint">客户</div><strong>{c.customerName}</strong></div>
          <div><div className="hint">类型</div>{c.typePath}</div>
          <div><div className="hint">优先级 / 严重度</div>{c.priority} / {SEVERITY_NAMES[c.severity]}</div>
          <div><div className="hint">负责人</div>{c.owner ?? '—'}</div>
          <div><div className="hint">涉及产品</div>{c.productInfo ?? '—'}</div>
          <div><div className="hint">关联不合格品</div>{c.ncrId ? <Link to={`/ncrs/${c.ncrId}`}>查看 NCR</Link> : '—'}</div>
          <div><div className="hint">关联整改</div>{c.carId ? <Link to={`/capa/${c.carId}`}>查看 CAPA</Link> : '—'}</div>
          <div><div className="hint">客诉成本</div>{c.cost !== undefined ? `¥${c.cost.toLocaleString()}` : '—'}</div>
        </div>
        <p style={{ marginTop: 10 }}><strong>问题描述：</strong>{c.desc}</p>
      </div>

      {isQe && c.status !== 'closed' && (
        <div className="card no-print">
          <h2>客诉处理</h2>
          {error && <div className="alert error">{error}</div>}
          <div className="field"><label>处理记录{close ? '（关闭必填）' : ''}</label><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div className="grid cols-4">
            <div className="field"><label>客诉成本（元）</label><input type="number" min={0} step="any" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
            <div className="field">
              <label>关联动作</label>
              <label style={{ fontWeight: 400, fontSize: 13 }}><input type="checkbox" checked={registerNcr} onChange={(e) => setRegisterNcr(e.target.checked)} disabled={!!c.ncrId} /> 登记不合格品</label>
              <label style={{ fontWeight: 400, fontSize: 13 }}><input type="checkbox" checked={startCapa} onChange={(e) => setStartCapa(e.target.checked)} disabled={!!c.carId} /> 发起 CAPA(SCAR)</label>
              <label style={{ fontWeight: 400, fontSize: 13 }}><input type="checkbox" checked={close} onChange={(e) => setClose(e.target.checked)} /> 处理完成并关闭</label>
            </div>
          </div>
          <button className="btn primary" onClick={submit} disabled={busy}>{busy ? '提交中…' : '提交'}</button>
        </div>
      )}

      <div className="card">
        <h2>处理记录</h2>
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

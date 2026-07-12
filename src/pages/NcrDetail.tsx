import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Ncr } from '../../shared/types';
import { DISPOSITION_NAMES, NCR_STATUS_NAMES, SEVERITY_NAMES } from '../../shared/types';
import { api } from '../api';
import { useAuth } from '../auth';

export default function NcrDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isInternal = (user?.userType ?? 'internal') === 'internal';
  const isQe = isInternal && (user?.role === 'qe' || user?.role === 'admin');
  const [ncr, setNcr] = useState<Ncr | null>(null);
  const [error, setError] = useState('');
  const [disposition, setDisposition] = useState('return');
  const [note, setNote] = useState('');
  const [cost, setCost] = useState('');
  const [costBearer, setCostBearer] = useState('供应商');
  const [startCapa, setStartCapa] = useState(false);
  const [close, setClose] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    api.ncr(id).then(setNcr).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  async function submit() {
    if (!id) return;
    setBusy(true); setError('');
    try {
      await api.ncrDisposition(id, {
        disposition, note,
        cost: cost ? Number(cost) : undefined,
        costBearer: cost ? costBearer : undefined,
        startCapa, close,
      });
      setNote(''); setCost('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败');
    } finally {
      setBusy(false);
    }
  }

  if (error && !ncr) return <div className="alert error">{error}</div>;
  if (!ncr) return <div className="empty">加载中…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>不合格品 {ncr.no} {ncr.demo && <span className="badge gray">演示数据</span>}</h1>
          <div className="sub">
            <Link to="/ncrs">← 返回列表</Link>　状态：
            <span className={`badge ${ncr.status === 'closed' ? 'green' : ncr.status === 'processing' ? 'amber' : 'red'}`}>{NCR_STATUS_NAMES[ncr.status]}</span>
          </div>
        </div>
        <button className="btn no-print" onClick={() => window.print()}>打印</button>
      </div>

      <div className="card">
        <h2>不合格信息</h2>
        <div className="grid cols-4">
          <div><div className="hint">来源</div><strong>{ncr.source}</strong></div>
          <div><div className="hint">物料/产品</div><strong>{ncr.materialName}</strong></div>
          <div><div className="hint">供应商</div>{ncr.supplier ?? '—'}</div>
          <div><div className="hint">不合格数量</div>{ncr.qty}</div>
          <div><div className="hint">严重度</div>{ncr.severity ? SEVERITY_NAMES[ncr.severity] : '—'}</div>
          <div><div className="hint">关联批次</div>{ncr.batchId ? <Link to={`/batches/${ncr.batchId}`}>{ncr.batchNo}</Link> : '—'}</div>
          <div><div className="hint">关联整改</div>{ncr.carId ? <Link to={`/capa/${ncr.carId}`}>查看 CAPA</Link> : '—'}</div>
          <div><div className="hint">供应商可见</div>{ncr.shareWithSupplier ? '是' : '否'}</div>
        </div>
        <p style={{ marginTop: 10 }}><strong>不合格描述：</strong>{ncr.defectDesc}</p>
        {ncr.disposition && (
          <p>
            <strong>处置方式：</strong>{DISPOSITION_NAMES[ncr.disposition]}
            {ncr.dispositionNote && `　说明：${ncr.dispositionNote}`}
            {ncr.cost !== undefined && `　质量成本：¥${ncr.cost.toLocaleString()}（承担方：${ncr.costBearer ?? '—'}）`}
          </p>
        )}
      </div>

      {isQe && ncr.status !== 'closed' && (
        <div className="card no-print">
          <h2>处置（质量工程师）</h2>
          {error && <div className="alert error">{error}</div>}
          <div className="grid cols-4">
            <div className="field">
              <label>处置方式 *</label>
              <select value={disposition} onChange={(e) => setDisposition(e.target.value)}>
                {Object.entries(DISPOSITION_NAMES).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </div>
            <div className="field"><label>质量成本（元）</label><input type="number" min={0} step="any" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
            <div className="field"><label>费用承担方</label><input value={costBearer} onChange={(e) => setCostBearer(e.target.value)} /></div>
            <div className="field">
              <label>后续动作</label>
              <label style={{ fontWeight: 400, fontSize: 13 }}><input type="checkbox" checked={startCapa} onChange={(e) => setStartCapa(e.target.checked)} disabled={!!ncr.carId} /> 发起 CAPA 整改</label>
              <label style={{ fontWeight: 400, fontSize: 13 }}><input type="checkbox" checked={close} onChange={(e) => setClose(e.target.checked)} /> 处置完成并关闭</label>
            </div>
          </div>
          <div className="field"><label>处置说明 *</label><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="处置理由、要求、纠正措施要求等" /></div>
          <button className="btn primary" onClick={submit} disabled={busy}>{busy ? '提交中…' : '提交处置'}</button>
        </div>
      )}

      <div className="card">
        <h2>流转记录</h2>
        <ul className="timeline">
          {ncr.history.map((h, i) => (
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

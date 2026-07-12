import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { TraceResult } from '../api';
import { api } from '../api';
import StatusBadge from '../components/StatusBadge';
import type { BatchStatus } from '../../shared/types';

export default function Trace() {
  const [q, setQ] = useState('');
  const [result, setResult] = useState<TraceResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function search() {
    if (!q.trim()) return;
    setBusy(true); setError('');
    try {
      setResult(await api.trace(q.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : '查询失败');
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  const total = result
    ? result.batches.length + result.ncrs.length + result.complaints.length + result.capas.length + result.costs.length
    : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>全景追溯</h1>
          <div className="sub">按批次号 / 物料 / 供应商 / 采购单号 / 发货单号一键穿透查询关联质量事件链（方案 19 项）</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            placeholder="输入批次号 / 物料名称 / 供应商 / PO 号 / 发货单号 / NCR 单号…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            style={{ flex: 1 }}
          />
          <button className="btn primary" onClick={search} disabled={busy || !q.trim()}>{busy ? '查询中…' : '追溯查询'}</button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      {result && (
        <div className="card">
          <h2>追溯结果（{total} 条关联记录）</h2>
          {total === 0 && <div className="empty">未找到关联的质量事件</div>}

          {result.batches.length > 0 && (
            <div className="trace-section">
              <div className="sec-title">① 检验批次（{result.batches.length}）</div>
              <table className="tbl">
                <thead><tr><th>批次号</th><th>类别</th><th>物料</th><th>供应商</th><th>日期</th><th>状态</th><th>结论</th></tr></thead>
                <tbody>
                  {result.batches.map((b) => (
                    <tr key={b.id}>
                      <td><Link to={`/batches/${b.id}`}>{b.batchNo}</Link></td>
                      <td><span className="badge blue">{b.kind}</span></td>
                      <td>{b.name}</td>
                      <td>{b.supplier}</td>
                      <td>{b.date}</td>
                      <td><StatusBadge status={b.status as BatchStatus} /></td>
                      <td>{b.lotPass === undefined ? '—' : b.lotPass ? <span className="badge green">接收</span> : <span className="badge red">拒收</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.ncrs.length > 0 && (
            <div className="trace-section">
              <div className="sec-title">② 不合格品（{result.ncrs.length}）</div>
              <table className="tbl">
                <thead><tr><th>单号</th><th>物料</th><th>来源批次</th><th>状态</th><th>时间</th></tr></thead>
                <tbody>
                  {result.ncrs.map((n) => (
                    <tr key={n.id}>
                      <td><Link to={`/ncrs/${n.id}`}>{n.no}</Link></td>
                      <td>{n.name}</td>
                      <td>{n.batchNo ?? '—'}</td>
                      <td><span className={`badge ${n.status === 'closed' ? 'green' : 'amber'}`}>{n.status === 'closed' ? '已关闭' : n.status === 'processing' ? '处理中' : '待处理'}</span></td>
                      <td>{new Date(n.createdAt).toLocaleDateString('zh-CN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.complaints.length > 0 && (
            <div className="trace-section">
              <div className="sec-title">③ 客户投诉（{result.complaints.length}）</div>
              <table className="tbl">
                <thead><tr><th>单号</th><th>客户</th><th>状态</th><th>时间</th></tr></thead>
                <tbody>
                  {result.complaints.map((c) => (
                    <tr key={c.id}>
                      <td><Link to={`/complaints/${c.id}`}>{c.no}</Link></td>
                      <td>{c.customer}</td>
                      <td><span className={`badge ${c.status === 'closed' ? 'green' : 'amber'}`}>{c.status === 'closed' ? '已关闭' : '处理中'}</span></td>
                      <td>{new Date(c.createdAt).toLocaleDateString('zh-CN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.capas.length > 0 && (
            <div className="trace-section">
              <div className="sec-title">④ CAPA 整改（{result.capas.length}）</div>
              <table className="tbl">
                <thead><tr><th>单号</th><th>主题</th><th>来源单据</th><th>状态</th><th>时间</th></tr></thead>
                <tbody>
                  {result.capas.map((c) => (
                    <tr key={c.id}>
                      <td><Link to={`/capa/${c.id}`}>{c.no}</Link></td>
                      <td>{c.title}</td>
                      <td>{c.refNo ?? '—'}</td>
                      <td><span className={`badge ${c.status === 'closed' ? 'green' : 'amber'}`}>{c.status}</span></td>
                      <td>{new Date(c.createdAt).toLocaleDateString('zh-CN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.costs.length > 0 && (
            <div className="trace-section">
              <div className="sec-title">⑤ 质量成本（{result.costs.length}）</div>
              <table className="tbl">
                <thead><tr><th>日期</th><th>类型</th><th className="num">金额(元)</th><th>关联单据</th></tr></thead>
                <tbody>
                  {result.costs.map((c) => (
                    <tr key={c.id}>
                      <td>{c.date}</td><td>{c.typePath}</td><td className="num">{c.amount.toLocaleString()}</td><td>{c.refNo ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}

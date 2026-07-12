import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BatchStatus, BatchSummary, InspectionKind } from '../../shared/types';
import { STATUS_NAMES } from '../../shared/types';
import { api } from '../api';
import { useAuth } from '../auth';
import StatusBadge from '../components/StatusBadge';

/** 方案 4.3.2 四色标记 */
function colorDot(status: BatchStatus): string {
  if (status === 'pending_inspection') return '#8296a8'; // 未检验：灰
  if (status === 'pending_review') return '#0e77b4'; // 检验进行中：蓝
  if (status === 'accepted' || status === 'concession') return '#1a8a4c'; // 合格：绿
  return '#c22f2f'; // 不合格：红
}

export default function BatchList() {
  const { user } = useAuth();
  const isInternal = (user?.userType ?? 'internal') === 'internal';
  const [batches, setBatches] = useState<BatchSummary[] | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    api.batches().then(setBatches).catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!batches) return [];
    return batches.filter((b) => {
      if (status && b.status !== status) return false;
      if (kind && (b.kind ?? 'IQC') !== kind) return false;
      if (keyword) {
        const k = keyword.trim().toLowerCase();
        return (
          b.batchNo.toLowerCase().includes(k) ||
          b.supplier.toLowerCase().includes(k) ||
          b.componentTypeName.toLowerCase().includes(k) ||
          (b.customerName ?? '').toLowerCase().includes(k)
        );
      }
      return true;
    });
  }, [batches, status, kind, keyword]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isInternal ? '检验台账' : '我的来料批次'}</h1>
          <div className="sub">四色状态：灰=未检验 · 蓝=检验中/待批 · 绿=合格 · 红=不合格</div>
        </div>
        {isInternal && <Link to="/batches/new" className="btn primary">+ 报检登记</Link>}
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="tabs">
        {[['', '全部'], ['IQC', '来料 IQC'], ['IPQC', '过程 IPQC'], ['OQC', '出货 OQC']].map(([v, label]) => (
          <button key={v} className={kind === v ? 'active' : ''} onClick={() => setKind(v)}>{label}</button>
        ))}
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="搜索批次号 / 供应商 / 物料 / 客户…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ maxWidth: 320 }}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 180 }}>
            <option value="">全部状态</option>
            {(Object.keys(STATUS_NAMES) as BatchStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_NAMES[s]}</option>
            ))}
          </select>
        </div>

        {!batches ? (
          <div className="empty">加载中…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">暂无符合条件的批次</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th></th>
                <th>批次号</th>
                <th>类别</th>
                <th>物料/对象</th>
                <th>供应商/客户/产线</th>
                <th className="num">批量</th>
                <th>日期</th>
                <th>状态</th>
                <th>结论</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const k = (b.kind ?? 'IQC') as InspectionKind;
                return (
                  <tr key={b.id}>
                    <td><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: colorDot(b.status) }} /></td>
                    <td>
                      <Link to={`/batches/${b.id}`}>{b.batchNo}</Link>
                      {b.demo && <span className="badge gray" style={{ marginLeft: 6 }}>演示</span>}
                    </td>
                    <td><span className="badge blue">{k}</span></td>
                    <td>{b.componentTypeName}</td>
                    <td>{k === 'OQC' ? b.customerName ?? '—' : k === 'IPQC' ? `${b.line ?? ''} ${b.processInspType ?? ''}` : b.supplier}</td>
                    <td className="num">{b.quantity.toLocaleString()}</td>
                    <td>{b.arrivalDate}</td>
                    <td><StatusBadge status={b.status} /></td>
                    <td>
                      {b.lotPass === undefined ? '—' : b.lotPass
                        ? <span className="badge green">接收</span>
                        : <span className="badge red">拒收</span>}
                    </td>
                    <td><Link to={`/batches/${b.id}`} className="btn sm">查看</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

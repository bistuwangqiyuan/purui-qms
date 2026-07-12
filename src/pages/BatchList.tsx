import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BatchSummary, BatchStatus } from '../../shared/types';
import { STATUS_NAMES } from '../../shared/types';
import { api } from '../api';
import StatusBadge from '../components/StatusBadge';

export default function BatchList() {
  const [batches, setBatches] = useState<BatchSummary[] | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    api.batches().then(setBatches).catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!batches) return [];
    return batches.filter((b) => {
      if (status && b.status !== status) return false;
      if (keyword) {
        const k = keyword.trim().toLowerCase();
        return (
          b.batchNo.toLowerCase().includes(k) ||
          b.supplier.toLowerCase().includes(k) ||
          b.componentTypeName.toLowerCase().includes(k)
        );
      }
      return true;
    });
  }, [batches, status, keyword]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>批次台账</h1>
          <div className="sub">全部来料批次的检验状态与追溯入口</div>
        </div>
        <Link to="/batches/new" className="btn primary">+ 来料登记</Link>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="搜索批次号 / 供应商 / 组部件…"
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
                <th>批次号</th>
                <th>组部件</th>
                <th>供应商</th>
                <th className="num">批量</th>
                <th>到货日期</th>
                <th>状态</th>
                <th>检验结论</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link to={`/batches/${b.id}`}>{b.batchNo}</Link>
                    {b.demo && <span className="badge gray" style={{ marginLeft: 6 }}>演示</span>}
                  </td>
                  <td>{b.componentTypeName}</td>
                  <td>{b.supplier}</td>
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
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

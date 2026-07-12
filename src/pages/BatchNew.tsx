import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ComponentType } from '../../shared/types';
import { getSamplingPlan } from '../../shared/sampling';
import { api } from '../api';
import { useAuth } from '../auth';

export default function BatchNew() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [types, setTypes] = useState<ComponentType[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [componentTypeId, setComponentTypeId] = useState('');
  const [supplier, setSupplier] = useState('');
  const [supplierLotNo, setSupplierLotNo] = useState('');
  const [quantity, setQuantity] = useState('');
  const [arrivalDate, setArrivalDate] = useState(() => {
    // 本地时区日期（toISOString 为 UTC，凌晨会差一天）
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [poNo, setPoNo] = useState('');
  const [project, setProject] = useState('');

  useEffect(() => {
    api.componentTypes().then(setTypes).catch((e) => setError(e.message));
  }, []);

  const selected = types.find((t) => t.id === componentTypeId);
  const qty = Math.floor(Number(quantity));

  const preview = useMemo(() => {
    if (!selected || !Number.isFinite(qty) || qty < 2 || qty > 500000) return null;
    try {
      return getSamplingPlan(qty, selected.aql);
    } catch {
      return null;
    }
  }, [selected, qty]);

  const readOnly = user?.role === 'qe';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const b = await api.createBatch({
        componentTypeId,
        supplier,
        supplierLotNo: supplierLotNo || undefined,
        quantity: qty,
        arrivalDate,
        poNo: poNo || undefined,
        project: project || undefined,
      });
      navigate(`/batches/${b.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败');
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>来料登记</h1>
          <div className="sub">登记后系统按 GB/T 2828.1-2012（一般检验水平 II、正常检验一次抽样）自动生成抽样方案</div>
        </div>
      </div>

      {readOnly && <div className="alert info">当前角色为质量工程师，来料登记由检验员或管理员执行。</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="grid cols-2">
        <form className="card" onSubmit={onSubmit}>
          <h2>批次信息</h2>
          <div className="field">
            <label>组部件类型 *</label>
            <select value={componentTypeId} onChange={(e) => setComponentTypeId(e.target.value)} required disabled={readOnly}>
              <option value="">请选择…</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} · {t.name}（{t.category}，AQL {t.aql}）
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>供应商 *</label>
            <input type="text" value={supplier} onChange={(e) => setSupplier(e.target.value)} required disabled={readOnly} placeholder="供应商全称" />
          </div>
          <div className="field">
            <label>供应商批号</label>
            <input type="text" value={supplierLotNo} onChange={(e) => setSupplierLotNo(e.target.value)} disabled={readOnly} />
          </div>
          <div className="field">
            <label>到货数量（批量 N）*</label>
            <input type="number" min={2} max={500000} value={quantity} onChange={(e) => setQuantity(e.target.value)} required disabled={readOnly} />
            <div className="hint">2–500000 件</div>
          </div>
          <div className="field">
            <label>到货日期 *</label>
            <input type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} required disabled={readOnly} />
          </div>
          <div className="field">
            <label>采购订单号</label>
            <input type="text" value={poNo} onChange={(e) => setPoNo(e.target.value)} disabled={readOnly} />
          </div>
          <div className="field">
            <label>所属工程项目</label>
            <input type="text" value={project} onChange={(e) => setProject(e.target.value)} disabled={readOnly} />
          </div>
          <button className="btn primary" disabled={busy || readOnly}>{busy ? '提交中…' : '登记并生成抽样方案'}</button>
        </form>

        <div>
          <div className="card">
            <h2>抽样方案预览</h2>
            {!preview ? (
              <div className="empty">选择组部件并填写批量后自动计算</div>
            ) : (
              <table className="tbl">
                <tbody>
                  <tr><td>批量 N</td><td className="num">{preview.lotSize.toLocaleString()}</td></tr>
                  <tr><td>AQL（{selected?.category}）</td><td className="num">{preview.aql}</td></tr>
                  <tr><td>样本量字码（水平 II）</td><td className="num">{preview.codeLetter}{preview.effectiveLetter !== preview.codeLetter ? ` → ${preview.effectiveLetter}（箭头规则）` : ''}</td></tr>
                  <tr><td>样本量 n</td><td className="num"><strong>{preview.sampleSize}</strong>{preview.fullInspection ? '（全数检验）' : ''}</td></tr>
                  <tr><td>接收数 Ac</td><td className="num"><strong>{preview.ac}</strong></td></tr>
                  <tr><td>拒收数 Re</td><td className="num"><strong>{preview.re}</strong></td></tr>
                </tbody>
              </table>
            )}
            <div className="hint" style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-3)' }}>
              依据 GB/T 2828.1-2012 表1、表2-A 检索；不合格品数 ≤ Ac 接收，≥ Re 拒收。
              方案检索逻辑可用仓库内 scripts/verify_sampling.py 独立复现验证。
            </div>
          </div>

          {selected && (
            <div className="card">
              <h2>{selected.name} · 检验项目（{selected.items.length} 项）</h2>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 10 }}>{selected.description}</div>
              <table className="tbl">
                <thead><tr><th>项目</th><th>方法</th><th>技术要求</th></tr></thead>
                <tbody>
                  {selected.items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.name}</td>
                      <td>{it.method}</td>
                      <td>{it.requirement}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { InspectionKind, InspectionStandard, Material, Partner, SamplingPlan } from '../../shared/types';
import { api } from '../api';
import { useAuth } from '../auth';

export default function BatchNew() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [standards, setStandards] = useState<InspectionStandard[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState<InspectionKind>('IQC');
  const [materialId, setMaterialId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierLotNo, setSupplierLotNo] = useState('');
  const [quantity, setQuantity] = useState('');
  const [arrivalDate, setArrivalDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [poNo, setPoNo] = useState('');
  const [project, setProject] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [shipmentNo, setShipmentNo] = useState('');
  const [line, setLine] = useState('');
  const [processName, setProcessName] = useState('');
  const [processInspType, setProcessInspType] = useState('巡检');
  const [preview, setPreview] = useState<SamplingPlan | null>(null);

  useEffect(() => {
    Promise.all([api.materials(), api.partners(), api.standards()])
      .then(([m, p, s]) => { setMaterials(m.filter((x) => x.active)); setPartners(p.filter((x) => x.active)); setStandards(s); })
      .catch((e) => setError(e.message));
  }, []);

  const suppliers = useMemo(() => partners.filter((p) => p.partnerKind === 'supplier'), [partners]);
  const customers = useMemo(() => partners.filter((p) => p.partnerKind === 'customer'), [partners]);
  const material = materials.find((m) => m.id === materialId);
  const standard = standards.find((s) => s.id === material?.standardId);
  const qty = Math.floor(Number(quantity));

  useEffect(() => {
    setPreview(null);
    if (!standard || !Number.isFinite(qty) || qty < 2 || qty > 500000) return;
    let alive = true;
    api.samplingPreview({ lot: qty, standardId: standard.id })
      .then((p) => alive && setPreview(p))
      .catch(() => {});
    return () => { alive = false; };
  }, [standard, qty]);

  const readOnly = user?.role === 'qe';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const b = await api.createBatch({
        kind,
        materialId,
        supplierId: kind !== 'OQC' ? supplierId || undefined : undefined,
        supplier: kind !== 'OQC' ? suppliers.find((s) => s.id === supplierId)?.name : undefined,
        supplierLotNo: supplierLotNo || undefined,
        quantity: qty,
        arrivalDate,
        poNo: poNo || undefined,
        project: project || undefined,
        customerId: kind === 'OQC' ? customerId : undefined,
        shipmentNo: kind === 'OQC' ? shipmentNo || undefined : undefined,
        line: kind === 'IPQC' ? line : undefined,
        process: kind === 'IPQC' ? processName || undefined : undefined,
        processInspType: kind === 'IPQC' ? processInspType : undefined,
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
          <h1>报检登记</h1>
          <div className="sub">来料 IQC / 过程 IPQC / 出货 OQC · 按物料绑定的检验标准自动生成抽样方案</div>
        </div>
      </div>

      {readOnly && <div className="alert info">当前角色为质量工程师，报检登记由检验员或管理员执行。</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="tabs">
        {(['IQC', 'IPQC', 'OQC'] as InspectionKind[]).map((k) => (
          <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
            {k === 'IQC' ? '来料检验 IQC' : k === 'IPQC' ? '过程检验 IPQC' : '出货检验 OQC'}
          </button>
        ))}
      </div>

      <div className="grid cols-2">
        <form className="card" onSubmit={onSubmit}>
          <h2>批次信息</h2>
          <div className="field">
            <label>物料 *</label>
            <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} required disabled={readOnly}>
              <option value="">请选择…</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id} disabled={!m.standardId}>
                  {m.code} · {m.name}{!m.standardId ? '（未绑定检验标准）' : ''}
                </option>
              ))}
            </select>
            <div className="hint">物料及其检验标准在"基础数据 / 物料检验标准"中维护</div>
          </div>

          {kind !== 'OQC' && (
            <div className="field">
              <label>供应商{kind === 'IQC' ? ' *' : ''}</label>
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required={kind === 'IQC'} disabled={readOnly}>
                <option value="">请选择…</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} {s.name}</option>)}
              </select>
            </div>
          )}
          {kind === 'IQC' && (
            <div className="field"><label>供应商批号</label><input value={supplierLotNo} onChange={(e) => setSupplierLotNo(e.target.value)} disabled={readOnly} /></div>
          )}
          {kind === 'OQC' && (
            <>
              <div className="field">
                <label>客户 *</label>
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required disabled={readOnly}>
                  <option value="">请选择…</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
                </select>
              </div>
              <div className="field"><label>发货单号</label><input value={shipmentNo} onChange={(e) => setShipmentNo(e.target.value)} disabled={readOnly} /></div>
            </>
          )}
          {kind === 'IPQC' && (
            <>
              <div className="field"><label>产线 *</label><input value={line} onChange={(e) => setLine(e.target.value)} required disabled={readOnly} placeholder="如：阀组件装配一线" /></div>
              <div className="field"><label>工序</label><input value={processName} onChange={(e) => setProcessName(e.target.value)} disabled={readOnly} /></div>
              <div className="field">
                <label>检验类型</label>
                <select value={processInspType} onChange={(e) => setProcessInspType(e.target.value)} disabled={readOnly}>
                  {['首检', '巡检', '末检', '生产自检'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
            </>
          )}

          <div className="field">
            <label>{kind === 'OQC' ? '发货数量' : kind === 'IPQC' ? '受检数量' : '到货数量'}（批量 N）*</label>
            <input type="number" min={2} max={500000} value={quantity} onChange={(e) => setQuantity(e.target.value)} required disabled={readOnly} />
          </div>
          <div className="field"><label>日期 *</label><input type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} required disabled={readOnly} /></div>
          {kind === 'IQC' && <div className="field"><label>采购订单号</label><input value={poNo} onChange={(e) => setPoNo(e.target.value)} disabled={readOnly} /></div>}
          <div className="field"><label>所属工程项目</label><input value={project} onChange={(e) => setProject(e.target.value)} disabled={readOnly} /></div>
          <button className="btn primary" disabled={busy || readOnly}>{busy ? '提交中…' : '登记并生成抽样方案'}</button>
        </form>

        <div>
          <div className="card">
            <h2>抽样方案预览</h2>
            {!preview ? (
              <div className="empty">选择已绑定标准的物料并填写批量后自动计算</div>
            ) : (
              <table className="tbl">
                <tbody>
                  <tr><td>批量 N</td><td className="num">{preview.lotSize.toLocaleString()}</td></tr>
                  <tr>
                    <td>抽样方式</td>
                    <td className="num">
                      {preview.mode === 'fixed' ? '固定数量' : preview.mode === 'percent' ? '百分比' : `AQL ${preview.aql}（GB/T 2828.1 水平II）`}
                    </td>
                  </tr>
                  {preview.mode === 'aql' && (
                    <tr><td>字码</td><td className="num">{preview.codeLetter}{preview.effectiveLetter !== preview.codeLetter ? ` → ${preview.effectiveLetter}（箭头规则）` : ''}</td></tr>
                  )}
                  <tr><td>样本量 n</td><td className="num"><strong>{preview.sampleSize}</strong>{preview.fullInspection ? '（全数检验）' : ''}</td></tr>
                  <tr><td>Ac / Re</td><td className="num"><strong>{preview.ac} / {preview.re}</strong></td></tr>
                </tbody>
              </table>
            )}
            {standard?.skipRule?.enabled && (
              <div className="alert info" style={{ marginTop: 10 }}>
                本标准启用跳检规则：连续 {standard.skipRule.consecutivePass} 批接收后，每 {standard.skipRule.skipOneOf} 批实检 1 批，其余批免检放行（登记时自动判定）。
              </div>
            )}
          </div>

          {standard && (
            <div className="card">
              <h2>{standard.name}（{standard.items.length} 项）</h2>
              <table className="tbl">
                <thead><tr><th>条目</th><th>类型</th><th>技术要求</th><th>特殊特性</th></tr></thead>
                <tbody>
                  {standard.items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.name}</td>
                      <td>{it.kind === 'quantitative' ? '计量' : '计数'}</td>
                      <td>{it.requirement}</td>
                      <td>{it.special ? <span className="badge amber">★</span> : ''}</td>
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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Batch, ComponentType, InspectionItemResult } from '../../shared/types';
import { STATUS_NAMES } from '../../shared/types';
import { api } from '../api';
import { useAuth } from '../auth';
import StatusBadge from '../components/StatusBadge';

interface ItemDraft {
  templateId: string;
  values: string[]; // 定量项实测值（字符串态）
  qualitativeDefects: string; // 定性项不合格品数
  note: string;
}

export default function BatchDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [type, setType] = useState<ComponentType | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const b = await api.batch(id);
      setBatch(b);
      const types = await api.componentTypes();
      setType(types.find((t) => t.id === b.componentTypeId) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (error) return <div className="alert error">{error}</div>;
  if (!batch) return <div className="empty">加载中…</div>;

  const canInspect = (user?.role === 'inspector' || user?.role === 'admin') && batch.status === 'pending_inspection';
  const canReview = (user?.role === 'qe' || user?.role === 'admin') && batch.status === 'pending_review';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>批次 {batch.batchNo} {batch.demo && <span className="badge gray">演示数据</span>}</h1>
          <div className="sub">
            <Link to="/batches">← 返回台账</Link>　状态：<StatusBadge status={batch.status} />
          </div>
        </div>
        <button className="btn no-print" onClick={() => window.print()}>打印检验报告</button>
      </div>

      <div className="card">
        <h2>批次信息</h2>
        <div className="grid cols-4">
          <div><div className="hint">组部件</div><strong>{batch.componentTypeName}</strong></div>
          <div><div className="hint">供应商</div><strong>{batch.supplier}</strong></div>
          <div><div className="hint">供应商批号</div>{batch.supplierLotNo || '—'}</div>
          <div><div className="hint">批量 N</div>{batch.quantity.toLocaleString()} 件</div>
          <div><div className="hint">到货日期</div>{batch.arrivalDate}</div>
          <div><div className="hint">采购订单</div>{batch.poNo || '—'}</div>
          <div><div className="hint">工程项目</div>{batch.project || '—'}</div>
          <div><div className="hint">登记人</div>{batch.createdByName}</div>
        </div>
      </div>

      <div className="card">
        <h2>抽样方案（GB/T 2828.1-2012 · 水平 II · 正常检验一次抽样）</h2>
        <div className="grid cols-4">
          <div><div className="hint">AQL</div><strong>{batch.sampling.aql}</strong></div>
          <div><div className="hint">字码</div><strong>{batch.sampling.codeLetter}{batch.sampling.effectiveLetter !== batch.sampling.codeLetter ? ` → ${batch.sampling.effectiveLetter}` : ''}</strong></div>
          <div><div className="hint">样本量 n</div><strong>{batch.sampling.sampleSize}{batch.sampling.fullInspection ? '（全数检验）' : ''}</strong></div>
          <div><div className="hint">Ac / Re</div><strong>{batch.sampling.ac} / {batch.sampling.re}</strong></div>
        </div>
      </div>

      {canInspect && type && (
        <InspectionForm batch={batch} type={type} onDone={load} />
      )}

      {batch.inspection && <InspectionResult batch={batch} />}

      {canReview && <ReviewPanel batch={batch} onDone={load} />}

      {batch.review && (
        <div className="card">
          <h2>审核处置记录</h2>
          <p>
            审核人：<strong>{batch.review.reviewerName}</strong>　
            时间：{new Date(batch.review.reviewedAt).toLocaleString('zh-CN')}　
            结论：<StatusBadge status={batch.status} />
          </p>
          {batch.review.note && <p>处置说明：{batch.review.note}</p>}
        </div>
      )}

      <div className="card">
        <h2>流转记录</h2>
        <ul className="timeline">
          {batch.history.map((h, i) => (
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

// ---------------- 检验执行表单 ----------------

function InspectionForm({ batch, type, onDone }: { batch: Batch; type: ComponentType; onDone: () => void }) {
  const [drafts, setDrafts] = useState<ItemDraft[]>(() =>
    type.items.map((t) => ({
      templateId: t.id,
      values: t.kind === 'quantitative' ? ['', '', ''] : [],
      qualitativeDefects: '0',
      note: '',
    })),
  );
  const [defectiveCount, setDefectiveCount] = useState('');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<{ id: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function updateDraft(idx: number, patch: Partial<ItemDraft>) {
    setDrafts((d) => d.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  /** 计算每个项目的越限数与不合格品数 */
  const computed = useMemo(() => {
    return type.items.map((tpl, i) => {
      const d = drafts[i];
      if (tpl.kind === 'quantitative') {
        const nums = d.values.filter((v) => v.trim() !== '').map(Number);
        const invalid = nums.some((n) => !Number.isFinite(n));
        const outOfRange = nums.filter(
          (n) => (tpl.min !== undefined && n < tpl.min) || (tpl.max !== undefined && n > tpl.max),
        ).length;
        return { nums, invalid, defects: outOfRange, filled: nums.length > 0 };
      }
      const q = Math.floor(Number(d.qualitativeDefects));
      const ok = Number.isFinite(q) && q >= 0 && q <= batch.sampling.sampleSize;
      return { nums: [], invalid: !ok, defects: ok ? q : 0, filled: true };
    });
  }, [drafts, type.items, batch.sampling.sampleSize]);

  const minDefective = Math.max(0, ...computed.map((c) => c.defects));
  const suggestedDefective = defectiveCount === '' ? String(minDefective) : defectiveCount;
  const defNum = Math.floor(Number(suggestedDefective));
  const willPass = Number.isFinite(defNum) && defNum <= batch.sampling.ac;

  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError('');
    try {
      for (const f of Array.from(files)) {
        // base64 膨胀约 37%，超过 3MB 的文件经编码后将超出函数载荷限制
        if (f.size > 3 * 1024 * 1024) {
          throw new Error(`照片"${f.name}"为 ${(f.size / 1024 / 1024).toFixed(1)} MB，超过 3 MB 限制，请压缩后上传`);
        }
        if (!f.type.startsWith('image/')) {
          throw new Error(`"${f.name}"不是图片文件`);
        }
        const pid = await api.uploadAttachment(f);
        setPhotos((p) => [...p, { id: pid, name: f.name }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败');
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setError('');
    if (computed.some((c) => c.invalid)) {
      setError('存在无效的实测值或不合格品数，请检查');
      return;
    }
    if (computed.some((c, i) => type.items[i].kind === 'quantitative' && !c.filled)) {
      setError('每个定量项目至少录入 1 个实测值');
      return;
    }
    if (!Number.isFinite(defNum) || defNum < minDefective || defNum > batch.sampling.sampleSize) {
      setError(`全批不合格品数须在 ${minDefective}–${batch.sampling.sampleSize} 之间（不得低于单项目最大不合格品数）`);
      return;
    }
    const items: InspectionItemResult[] = type.items.map((tpl, i) => {
      const c = computed[i];
      return {
        templateId: tpl.id,
        name: tpl.name,
        kind: tpl.kind,
        unit: tpl.unit,
        min: tpl.min,
        max: tpl.max,
        values: tpl.kind === 'quantitative' ? c.nums : undefined,
        qualitativePass: tpl.kind === 'qualitative' ? batch.sampling.sampleSize - c.defects : undefined,
        defects: c.defects,
        pass: c.defects === 0,
        note: drafts[i].note || undefined,
      };
    });
    setBusy(true);
    try {
      await api.submitInspection(batch.id, {
        items,
        defectiveCount: defNum,
        attachmentIds: photos.map((p) => p.id),
        note: note || undefined,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败');
      setBusy(false);
    }
  }

  return (
    <div className="card no-print">
      <h2>检验执行（样本量 n = {batch.sampling.sampleSize}）</h2>
      <div className="alert info">
        定量项目：录入抽测实测值（可增减录入格数，越限值自动计为该项目不合格品）；定性项目：录入发现的不合格品数。
        最后填写<strong>全批不合格品数</strong>（同一件产品多项不合格只计 1 件）。
      </div>

      {type.items.map((tpl, i) => {
        const d = drafts[i];
        const c = computed[i];
        return (
          <div className="item-block" key={tpl.id}>
            <div className="head">
              <div>
                <strong>{i + 1}. {tpl.name}</strong>
                {c.defects > 0 && <span className="badge red" style={{ marginLeft: 8 }}>不合格 {c.defects}</span>}
              </div>
              <span className="badge gray">{tpl.kind === 'quantitative' ? '定量' : '定性'}</span>
            </div>
            <div className="meta">
              方法：{tpl.method}　要求：{tpl.requirement}　依据：{tpl.basis}
            </div>
            {tpl.kind === 'quantitative' ? (
              <div className="values-row">
                {d.values.map((v, vi) => {
                  const n = Number(v);
                  const bad = v.trim() !== '' && Number.isFinite(n) &&
                    ((tpl.min !== undefined && n < tpl.min) || (tpl.max !== undefined && n > tpl.max));
                  return (
                    <input
                      key={vi}
                      type="number"
                      step="any"
                      placeholder={`实测${vi + 1}${tpl.unit ? ` (${tpl.unit})` : ''}`}
                      value={v}
                      style={bad ? { borderColor: 'var(--bad)', background: 'var(--bad-soft)' } : undefined}
                      onChange={(e) => {
                        const values = [...d.values];
                        values[vi] = e.target.value;
                        updateDraft(i, { values });
                      }}
                    />
                  );
                })}
                <button type="button" className="btn sm" onClick={() => updateDraft(i, { values: [...d.values, ''] })}>+ 加一格</button>
                {d.values.length > 1 && (
                  <button type="button" className="btn sm" onClick={() => updateDraft(i, { values: d.values.slice(0, -1) })}>− 减一格</button>
                )}
              </div>
            ) : (
              <div className="values-row" style={{ alignItems: 'center' }}>
                <label style={{ fontSize: 13 }}>本项目不合格品数：</label>
                <input
                  type="number"
                  min={0}
                  max={batch.sampling.sampleSize}
                  value={d.qualitativeDefects}
                  onChange={(e) => updateDraft(i, { qualitativeDefects: e.target.value })}
                />
                <span className="hint">/ {batch.sampling.sampleSize} 件受检</span>
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <input
                type="text"
                placeholder="备注（可选，如不合格现象描述）"
                value={d.note}
                onChange={(e) => updateDraft(i, { note: e.target.value })}
              />
            </div>
          </div>
        );
      })}

      <div className="item-block">
        <div className="head"><strong>检验照片上传</strong></div>
        <input type="file" accept="image/*" multiple onChange={(e) => onUpload(e.target.files)} disabled={uploading} />
        {uploading && <div className="hint">上传中…</div>}
        {photos.length > 0 && (
          <div className="photo-grid">
            {photos.map((p) => (
              <img key={p.id} src={api.attachmentUrl(p.id)} alt={p.name} title={p.name} />
            ))}
          </div>
        )}
      </div>

      <div className="item-block">
        <div className="head"><strong>批判定</strong></div>
        <div className="values-row" style={{ alignItems: 'center' }}>
          <label style={{ fontSize: 13 }}>全批不合格品数 d：</label>
          <input
            type="number"
            min={minDefective}
            max={batch.sampling.sampleSize}
            value={suggestedDefective}
            onChange={(e) => setDefectiveCount(e.target.value)}
          />
          <span className={`badge ${willPass ? 'green' : 'red'}`}>
            {willPass ? `d ≤ Ac(${batch.sampling.ac})，初判接收` : `d ≥ Re(${batch.sampling.re})，初判拒收`}
          </span>
        </div>
        <div style={{ marginTop: 10 }}>
          <textarea
            rows={2}
            placeholder="检验总备注（可选）"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      <button className="btn primary" onClick={submit} disabled={busy}>
        {busy ? '提交中…' : '提交检验结果（转质量工程师审核）'}
      </button>
    </div>
  );
}

// ---------------- 检验结果展示 ----------------

function InspectionResult({ batch }: { batch: Batch }) {
  const insp = batch.inspection!;
  return (
    <div className="card">
      <h2>检验记录</h2>
      <p>
        检验员：<strong>{insp.inspectorName}</strong>　
        时间：{new Date(insp.inspectedAt).toLocaleString('zh-CN')}　
        全批不合格品数：<strong>{insp.defectiveCount}</strong>（Ac={batch.sampling.ac} / Re={batch.sampling.re}）　
        批判定：{insp.lotPass ? <span className="badge green">接收</span> : <span className="badge red">拒收</span>}
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>检验项目</th>
            <th>类型</th>
            <th>实测记录</th>
            <th className="num">不合格品数</th>
            <th>单项判定</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {insp.items.map((it) => (
            <tr key={it.templateId}>
              <td>{it.name}</td>
              <td>{it.kind === 'quantitative' ? '定量' : '定性'}</td>
              <td>
                {it.kind === 'quantitative'
                  ? (it.values ?? []).map((v) => `${v}${it.unit ?? ''}`).join('，') || '—'
                  : `合格 ${it.qualitativePass ?? '—'} 件`}
                {it.kind === 'quantitative' && (it.min !== undefined || it.max !== undefined) && (
                  <div className="hint">
                    限值：{it.min !== undefined ? `≥${it.min}` : ''}{it.min !== undefined && it.max !== undefined ? '，' : ''}{it.max !== undefined ? `≤${it.max}` : ''} {it.unit}
                  </div>
                )}
              </td>
              <td className="num">{it.defects}</td>
              <td>{it.pass ? <span className="badge green">合格</span> : <span className="badge red">不合格</span>}</td>
              <td>{it.note ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {insp.note && <p style={{ marginTop: 10 }}>检验备注：{insp.note}</p>}
      {insp.attachmentIds.length > 0 && (
        <>
          <h2 style={{ marginTop: 16 }}>检验照片</h2>
          <div className="photo-grid">
            {insp.attachmentIds.map((aid) => (
              <a key={aid} href={api.attachmentUrl(aid)} target="_blank" rel="noreferrer">
                <img src={api.attachmentUrl(aid)} alt="检验照片" />
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------- 审核处置 ----------------

function ReviewPanel({ batch, onDone }: { batch: Batch; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lotPass = batch.inspection!.lotPass;

  async function decide(decision: string) {
    setError('');
    setBusy(true);
    try {
      await api.review(batch.id, decision, note || undefined);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
      setBusy(false);
    }
  }

  return (
    <div className="card no-print">
      <h2>审核处置（质量工程师）</h2>
      {lotPass ? (
        <div className="alert ok">检验初判：接收（不合格品数 ≤ Ac）。可确认合格接收，或退回重新检验。</div>
      ) : (
        <div className="alert error">
          检验初判：拒收（不合格品数 ≥ Re）。按不合格品控制程序进行 MRB 处置：退货 / 全检挑选 / 让步接收（须注明理由）。
        </div>
      )}
      <div className="field">
        <label>处置说明{lotPass ? '（可选）' : '（MRB 处置必填）'}</label>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="审核意见、处置理由、纠正措施要求等" />
      </div>
      {error && <div className="alert error">{error}</div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {lotPass ? (
          <button className="btn primary" disabled={busy} onClick={() => decide('accept')}>确认合格接收</button>
        ) : (
          <>
            <button className="btn danger" disabled={busy} onClick={() => decide('return')}>退货</button>
            <button className="btn" disabled={busy} onClick={() => decide('sort')}>全检挑选</button>
            <button className="btn" disabled={busy} onClick={() => decide('concession')}>让步接收</button>
          </>
        )}
        <button className="btn" disabled={busy} onClick={() => decide('reinspect')}>退回重新检验</button>
      </div>
    </div>
  );
}

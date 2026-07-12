import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AuditChecklist, AuditRecord } from '../../shared/types';
import { api } from '../api';
import { useAuth } from '../auth';
import Chart from '../components/Chart';

const STATUS_LABEL: Record<string, string> = { planned: '已计划', in_progress: '进行中', done: '已完成' };

export function Audits() {
  const { user } = useAuth();
  const isQe = user?.role === 'qe' || user?.role === 'admin';
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [checklists, setChecklists] = useState<AuditChecklist[]>([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'records' | 'checklists'>('records');
  const [planForm, setPlanForm] = useState<{ checklistId: string; target: string; plannedDate: string; auditor: string } | null>(null);
  const [clForm, setClForm] = useState<{ name: string; kind: string; itemsText: string } | null>(null);

  const load = useCallback(() => {
    Promise.all([api.audits(), api.auditChecklists()])
      .then(([r, c]) => { setRecords(r); setChecklists(c); })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function createPlan() {
    if (!planForm) return;
    setError('');
    try {
      await api.createAudit(planForm);
      setPlanForm(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败');
    }
  }

  async function createChecklist() {
    if (!clForm) return;
    setError('');
    try {
      const items = clForm.itemsText.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
        // 格式：条目文本|权重|必过（如 “工装校准有效|3|必过”）
        const [text, w, must] = l.split('|').map((s) => s.trim());
        return { id: '', text, weight: Number(w) || 1, mustPass: must === '必过' };
      });
      await api.createChecklist({ name: clForm.name, kind: clForm.kind as AuditChecklist['kind'], items });
      setClForm(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>评审管理</h1>
          <div className="sub">过程/产品/体系审核、5S、LPA 分层审核：清单 → 计划 → 执行评分 → 发现转整改（方案 4.10）</div>
        </div>
        {isQe && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => setClForm({ name: '', kind: '过程审核', itemsText: '' })}>+ 评审清单</button>
            <button className="btn primary" onClick={() => setPlanForm({ checklistId: checklists[0]?.id ?? '', target: '', plannedDate: new Date().toISOString().slice(0, 10), auditor: '' })}>+ 评审计划</button>
          </div>
        )}
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="tabs">
        <button className={tab === 'records' ? 'active' : ''} onClick={() => setTab('records')}>评审记录</button>
        <button className={tab === 'checklists' ? 'active' : ''} onClick={() => setTab('checklists')}>评审清单（{checklists.length}）</button>
      </div>

      {tab === 'records' && (
        <div className="card">
          <table className="tbl">
            <thead><tr><th>编号</th><th>清单</th><th>类型</th><th>评审对象</th><th>评审员</th><th>计划日期</th><th className="num">总分</th><th>状态</th><th></th></tr></thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td><Link to={`/audits/${r.id}`}>{r.no}</Link>{r.demo && <span className="badge gray" style={{ marginLeft: 6 }}>演示</span>}</td>
                  <td>{r.checklistName}</td>
                  <td><span className="badge violet">{r.kind}</span></td>
                  <td>{r.target}</td>
                  <td>{r.auditor}</td>
                  <td>{r.plannedDate}</td>
                  <td className="num">{r.totalScore ?? '—'}</td>
                  <td><span className={`badge ${r.status === 'done' ? 'green' : 'amber'}`}>{STATUS_LABEL[r.status]}</span></td>
                  <td><Link to={`/audits/${r.id}`} className="btn sm">{r.status === 'done' ? '查看' : '执行'}</Link></td>
                </tr>
              ))}
              {!records.length && <tr><td colSpan={9}><div className="empty">暂无评审记录</div></td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'checklists' && (
        <div className="card">
          {checklists.map((cl) => (
            <details key={cl.id} style={{ marginBottom: 10 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{cl.name}（{cl.kind}，{cl.items.length} 条）</summary>
              <table className="tbl" style={{ marginTop: 8 }}>
                <thead><tr><th>条目</th><th className="num">权重</th><th>必过项</th></tr></thead>
                <tbody>
                  {cl.items.map((it) => (
                    <tr key={it.id}><td>{it.text}</td><td className="num">{it.weight}</td><td>{it.mustPass ? <span className="badge red">必过</span> : '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </details>
          ))}
          {!checklists.length && <div className="empty">暂无评审清单</div>}
        </div>
      )}

      {planForm && (
        <div className="modal-mask" onClick={() => setPlanForm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>新建评审计划</h2>
            <div className="field">
              <label>评审清单 *</label>
              <select value={planForm.checklistId} onChange={(e) => setPlanForm({ ...planForm, checklistId: e.target.value })}>
                <option value="">请选择…</option>
                {checklists.map((c) => <option key={c.id} value={c.id}>{c.name}（{c.kind}）</option>)}
              </select>
            </div>
            <div className="field"><label>评审对象 *</label><input value={planForm.target} onChange={(e) => setPlanForm({ ...planForm, target: e.target.value })} placeholder="如：某供应商 / 阀组件装配一线 / 某过程" /></div>
            <div className="grid cols-2">
              <div className="field"><label>计划日期 *</label><input type="date" value={planForm.plannedDate} onChange={(e) => setPlanForm({ ...planForm, plannedDate: e.target.value })} /></div>
              <div className="field"><label>评审员</label><input value={planForm.auditor} onChange={(e) => setPlanForm({ ...planForm, auditor: e.target.value })} /></div>
            </div>
            <div className="actions">
              <button className="btn" onClick={() => setPlanForm(null)}>取消</button>
              <button className="btn primary" onClick={createPlan}>创建</button>
            </div>
          </div>
        </div>
      )}

      {clForm && (
        <div className="modal-mask" onClick={() => setClForm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>新建评审清单</h2>
            <div className="grid cols-2">
              <div className="field"><label>清单名称 *</label><input value={clForm.name} onChange={(e) => setClForm({ ...clForm, name: e.target.value })} /></div>
              <div className="field">
                <label>评审类型</label>
                <select value={clForm.kind} onChange={(e) => setClForm({ ...clForm, kind: e.target.value })}>
                  {['过程审核', '产品审核', '体系审核', '5S', 'LPA分层审核'].map((k) => <option key={k}>{k}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>评审条目 *（每行一条，格式：条目文本|权重|必过，权重与必过可省略）</label>
              <textarea rows={8} value={clForm.itemsText} onChange={(e) => setClForm({ ...clForm, itemsText: e.target.value })}
                placeholder={'作业指导书为最新受控版本|2|必过\n现场物料标识完整|2\n5S：工位整洁|1'} />
            </div>
            <div className="actions">
              <button className="btn" onClick={() => setClForm(null)}>取消</button>
              <button className="btn primary" onClick={createChecklist}>创建</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function AuditDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isQe = user?.role === 'qe' || user?.role === 'admin';
  const [rec, setRec] = useState<AuditRecord | null>(null);
  const [checklist, setChecklist] = useState<AuditChecklist | null>(null);
  const [error, setError] = useState('');
  const [scores, setScores] = useState<Record<string, { score: string; note: string }>>({});
  const [findingsText, setFindingsText] = useState('');
  const [capaDesc, setCapaDesc] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    api.audit(id).then(async (r) => {
      setRec(r);
      const cls = await api.auditChecklists();
      setChecklist(cls.find((c) => c.id === r.checklistId) ?? null);
    }).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  async function execute() {
    if (!id || !checklist) return;
    setBusy(true); setError('');
    try {
      await api.executeAudit(id, {
        scores: checklist.items.map((it) => ({
          itemId: it.id,
          score: Number(scores[it.id]?.score ?? ''),
          note: scores[it.id]?.note || undefined,
        })),
        findings: findingsText.split('\n').map((l) => l.trim()).filter(Boolean).map((desc) => ({ desc, startIssue: true })),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败');
    } finally {
      setBusy(false);
    }
  }

  async function startCapa() {
    if (!id || !capaDesc.trim()) return;
    setError('');
    try {
      await api.auditStartCapa(id, capaDesc.trim());
      setCapaDesc('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '发起失败');
    }
  }

  if (error && !rec) return <div className="alert error">{error}</div>;
  if (!rec) return <div className="empty">加载中…</div>;

  const radarOption = rec.scores && checklist ? {
    tooltip: {},
    radar: {
      indicator: checklist.items.map((it) => ({ name: it.text.slice(0, 12), max: 10 })),
      radius: '62%',
    },
    series: [{
      type: 'radar' as const,
      data: [{
        value: checklist.items.map((it) => rec.scores!.find((s) => s.itemId === it.id)?.score ?? 0),
        name: '评分',
        areaStyle: { opacity: 0.25 },
      }],
    }],
  } : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>评审 {rec.no} {rec.demo && <span className="badge gray">演示数据</span>}</h1>
          <div className="sub">
            <Link to="/audits">← 返回列表</Link>　{rec.checklistName} → {rec.target}　状态：
            <span className={`badge ${rec.status === 'done' ? 'green' : 'amber'}`}>{STATUS_LABEL[rec.status]}</span>
          </div>
        </div>
        <button className="btn no-print" onClick={() => window.print()}>打印评审报告</button>
      </div>

      {error && <div className="alert error">{error}</div>}

      {rec.status !== 'done' && checklist && (
        <div className="card no-print">
          <h2>执行评审（每条 0–10 分）</h2>
          {checklist.items.map((it) => (
            <div className="item-block" key={it.id}>
              <div className="head">
                <strong>{it.text}</strong>
                <span>权重 {it.weight}{it.mustPass && <span className="badge red" style={{ marginLeft: 6 }}>必过</span>}</span>
              </div>
              <div className="values-row" style={{ alignItems: 'center' }}>
                <input type="number" min={0} max={10} placeholder="0-10"
                  value={scores[it.id]?.score ?? ''}
                  onChange={(e) => setScores({ ...scores, [it.id]: { score: e.target.value, note: scores[it.id]?.note ?? '' } })} />
                <input type="text" placeholder="证据/备注（可选）" style={{ flex: 1, minWidth: 200 }}
                  value={scores[it.id]?.note ?? ''}
                  onChange={(e) => setScores({ ...scores, [it.id]: { score: scores[it.id]?.score ?? '', note: e.target.value } })} />
              </div>
            </div>
          ))}
          <div className="field">
            <label>评审发现（每行一条，自动登记为问题）</label>
            <textarea rows={3} value={findingsText} onChange={(e) => setFindingsText(e.target.value)} />
          </div>
          <button className="btn primary" onClick={execute} disabled={busy}>{busy ? '提交中…' : '提交评审结果'}</button>
        </div>
      )}

      {rec.status === 'done' && (
        <>
          <div className="grid cols-2">
            <div className="card">
              <h2>评分结果 · 总分 <span style={{ color: (rec.totalScore ?? 0) >= 80 ? 'var(--ok)' : 'var(--bad)' }}>{rec.totalScore}</span> / 100</h2>
              <table className="tbl">
                <thead><tr><th>条目</th><th className="num">得分</th><th>备注</th></tr></thead>
                <tbody>
                  {checklist?.items.map((it) => {
                    const s = rec.scores?.find((x) => x.itemId === it.id);
                    return (
                      <tr key={it.id}>
                        <td>{it.text}{it.mustPass && <span className="badge red" style={{ marginLeft: 6 }}>必过</span>}</td>
                        <td className="num">{s?.score ?? '—'}</td>
                        <td>{s?.note ?? ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="card">
              <h2>评分雷达图</h2>
              {radarOption ? <Chart option={radarOption} height={320} /> : <div className="empty">无数据</div>}
            </div>
          </div>

          <div className="card">
            <h2>评审发现（{rec.findings?.length ?? 0}）</h2>
            {rec.findings?.length ? (
              <ul>
                {rec.findings.map((f, i) => (
                  <li key={i}>{f.desc}{f.issueId && <span className="badge blue" style={{ marginLeft: 8 }}>已登记问题</span>}</li>
                ))}
              </ul>
            ) : <div className="empty">无发现项</div>}
            {isQe && (
              <div className="no-print" style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input placeholder="针对发现直接发起整改（CAR）…" value={capaDesc} onChange={(e) => setCapaDesc(e.target.value)} style={{ flex: 1 }} />
                <button className="btn" onClick={startCapa} disabled={!capaDesc.trim()}>发起 CAR</button>
              </div>
            )}
          </div>
        </>
      )}

      <div className="card">
        <h2>流转记录</h2>
        <ul className="timeline">
          {rec.history.map((h, i) => (
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

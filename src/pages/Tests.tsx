import { useCallback, useEffect, useState } from 'react';
import type { PeriodicTest, TestTemplate } from '../../shared/types';
import { api } from '../api';
import { useAuth } from '../auth';

export default function Tests() {
  const { user } = useAuth();
  const isQe = user?.role === 'qe' || user?.role === 'admin';
  const canExec = user?.role !== undefined;
  const [tests, setTests] = useState<PeriodicTest[]>([]);
  const [templates, setTemplates] = useState<TestTemplate[]>([]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [tplCreating, setTplCreating] = useState(false);
  const [execFor, setExecFor] = useState<PeriodicTest | null>(null);
  const [form, setForm] = useState({ name: '', target: '', cycleDays: '365', templateId: '', owner: '' });
  const [tplForm, setTplForm] = useState({ name: '', itemsText: '' });
  const [execForm, setExecForm] = useState({ result: 'pass', note: '' });

  const load = useCallback(() => {
    Promise.all([api.tests(), api.testTemplates()])
      .then(([t, tp]) => { setTests(t); setTemplates(tp); })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const today = new Date().toISOString().slice(0, 10);

  async function create() {
    setError('');
    try {
      await api.createTest({
        name: form.name, target: form.target, cycleDays: Number(form.cycleDays),
        templateId: form.templateId || undefined, owner: form.owner || undefined,
      });
      setCreating(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败');
    }
  }

  async function createTpl() {
    setError('');
    try {
      await api.createTestTemplate({ name: tplForm.name, items: tplForm.itemsText.split('\n').map((s) => s.trim()).filter(Boolean) });
      setTplCreating(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败');
    }
  }

  async function execute() {
    if (!execFor) return;
    setError('');
    try {
      await api.executeTest(execFor.id, execForm);
      setExecFor(null); setExecForm({ result: 'pass', note: '' });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>周期性试验</h1>
          <div className="sub">型式试验 / RoHS / 可靠性等按周期滚动管理（方案 4.7）</div>
        </div>
        {isQe && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => setTplCreating(true)}>+ 试验模板</button>
            <button className="btn primary" onClick={() => setCreating(true)}>+ 新建试验</button>
          </div>
        )}
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <table className="tbl">
          <thead><tr><th>编号</th><th>试验名称</th><th>对象</th><th className="num">周期(天)</th><th>下次到期</th><th>最近结果</th><th>状态</th><th></th></tr></thead>
          <tbody>
            {tests.map((t) => {
              const overdue = t.status === 'active' && t.nextDue <= today;
              const lastRec = t.records[t.records.length - 1];
              return (
                <tr key={t.id}>
                  <td>{t.no}{t.demo && <span className="badge gray" style={{ marginLeft: 6 }}>演示</span>}</td>
                  <td>{t.name}</td>
                  <td>{t.target}</td>
                  <td className="num">{t.cycleDays}</td>
                  <td>{overdue ? <span className="badge red">{t.nextDue} 已到期</span> : t.nextDue}</td>
                  <td>{lastRec ? (lastRec.result === 'pass' ? <span className="badge green">合格（{lastRec.date}）</span> : <span className="badge red">不合格（{lastRec.date}）</span>) : '—'}</td>
                  <td>{t.status === 'active' ? <span className="badge green">进行中</span> : <span className="badge gray">暂停</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {canExec && <button className="btn sm" onClick={() => setExecFor(t)}>执行</button>}{' '}
                    {isQe && <button className="btn sm" onClick={async () => { await api.updateTest(t.id, { status: t.status === 'active' ? 'paused' : 'active' }); load(); }}>{t.status === 'active' ? '暂停' : '恢复'}</button>}
                  </td>
                </tr>
              );
            })}
            {!tests.length && <tr><td colSpan={8}><div className="empty">暂无周期性试验</div></td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>试验模板（{templates.length}）</h2>
        {templates.map((tp) => (
          <details key={tp.id} style={{ marginBottom: 8 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{tp.name}（{tp.items.length} 项）</summary>
            <ul>{tp.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
          </details>
        ))}
        {!templates.length && <div className="empty">暂无模板</div>}
      </div>

      {creating && (
        <div className="modal-mask" onClick={() => setCreating(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>新建周期性试验</h2>
            <div className="field"><label>试验名称 *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label>试验对象 *</label><input value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="物料 / 供应商 / 产品" /></div>
            <div className="grid cols-2">
              <div className="field"><label>周期（天）*</label><input type="number" min={1} value={form.cycleDays} onChange={(e) => setForm({ ...form, cycleDays: e.target.value })} /></div>
              <div className="field">
                <label>试验模板</label>
                <select value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })}>
                  <option value="">不使用模板</option>
                  {templates.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
                </select>
              </div>
            </div>
            <div className="field"><label>负责人</label><input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} /></div>
            <div className="actions">
              <button className="btn" onClick={() => setCreating(false)}>取消</button>
              <button className="btn primary" onClick={create}>创建</button>
            </div>
          </div>
        </div>
      )}

      {tplCreating && (
        <div className="modal-mask" onClick={() => setTplCreating(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>新建试验模板</h2>
            <div className="field"><label>模板名称 *</label><input value={tplForm.name} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })} /></div>
            <div className="field"><label>试验项目 *（每行一项）</label><textarea rows={6} value={tplForm.itemsText} onChange={(e) => setTplForm({ ...tplForm, itemsText: e.target.value })} /></div>
            <div className="actions">
              <button className="btn" onClick={() => setTplCreating(false)}>取消</button>
              <button className="btn primary" onClick={createTpl}>创建</button>
            </div>
          </div>
        </div>
      )}

      {execFor && (
        <div className="modal-mask" onClick={() => setExecFor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>执行试验：{execFor.name}</h2>
            {execFor.templateId && (
              <div className="alert info">
                模板项目：{templates.find((tp) => tp.id === execFor.templateId)?.items.join('、') ?? '—'}
              </div>
            )}
            <div className="field">
              <label>试验结果 *</label>
              <select value={execForm.result} onChange={(e) => setExecForm({ ...execForm, result: e.target.value })}>
                <option value="pass">合格</option>
                <option value="fail">不合格</option>
              </select>
            </div>
            <div className="field"><label>试验记录/备注</label><textarea rows={3} value={execForm.note} onChange={(e) => setExecForm({ ...execForm, note: e.target.value })} /></div>
            <div className="alert info">提交后自动滚动下一周期（今天 + {execFor.cycleDays} 天）</div>
            <div className="actions">
              <button className="btn" onClick={() => setExecFor(null)}>取消</button>
              <button className="btn primary" onClick={execute}>提交结果</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

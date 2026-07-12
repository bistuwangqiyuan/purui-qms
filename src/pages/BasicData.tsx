import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  DefectCode,
  InspectionMethod,
  InspectionStandard,
  Material,
  Partner,
  Unit,
} from '../../shared/types';
import { SEVERITY_NAMES } from '../../shared/types';
import { api } from '../api';
import { useAuth } from '../auth';

type Tab = 'materials' | 'suppliers' | 'customers' | 'defects' | 'methods' | 'units';

const TABS: { id: Tab; label: string }[] = [
  { id: 'materials', label: '物料管理' },
  { id: 'suppliers', label: '供应商' },
  { id: 'customers', label: '客户' },
  { id: 'defects', label: '缺陷库' },
  { id: 'methods', label: '检验方法' },
  { id: 'units', label: '计量单位' },
];

export default function BasicData() {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'qe';
  const [tab, setTab] = useState<Tab>('materials');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [standards, setStandards] = useState<InspectionStandard[]>([]);
  const [defects, setDefects] = useState<DefectCode[]>([]);
  const [methods, setMethods] = useState<InspectionMethod[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [editing, setEditing] = useState<Record<string, string> | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [csvText, setCsvText] = useState('');

  const load = useCallback(() => {
    Promise.all([api.materials(), api.partners(), api.standards(), api.defects(), api.methods(), api.units()])
      .then(([m, p, s, d, me, u]) => {
        setMaterials(m); setPartners(p); setStandards(s); setDefects(d); setMethods(me); setUnits(u);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const suppliers = useMemo(() => partners.filter((p) => p.partnerKind === 'supplier'), [partners]);
  const customers = useMemo(() => partners.filter((p) => p.partnerKind === 'customer'), [partners]);

  function flash(msg: string) {
    setOk(msg); setError('');
    setTimeout(() => setOk(''), 3000);
  }

  async function save() {
    if (!editing) return;
    setError('');
    try {
      if (tab === 'materials') {
        await api.saveMaterial({
          id: editing.id || undefined, code: editing.code, name: editing.name,
          categoryPath: editing.categoryPath, unit: editing.unit, spec: editing.spec,
          standardId: editing.standardId || undefined, active: true,
        });
      } else if (tab === 'suppliers' || tab === 'customers') {
        await api.savePartner({
          id: editing.id || undefined, code: editing.code, name: editing.name,
          partnerKind: tab === 'suppliers' ? 'supplier' : 'customer',
          type: editing.type, contact: editing.contact, phone: editing.phone, email: editing.email, active: true,
        });
      } else if (tab === 'defects') {
        await api.saveDefect({
          id: editing.id || undefined, code: editing.code, name: editing.name,
          severity: editing.severity as DefectCode['severity'], score: Number(editing.score) || undefined,
        });
      } else if (tab === 'methods') {
        await api.saveMethod({ id: editing.id || undefined, name: editing.name, instrument: editing.instrument });
      } else {
        await api.saveUnit({ id: editing.id || undefined, name: editing.name, symbol: editing.symbol });
      }
      setEditing(null);
      flash('保存成功');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    }
  }

  async function doImport() {
    setError('');
    try {
      const kind = tab === 'materials' ? 'materials' : tab === 'suppliers' ? 'suppliers' : 'customers';
      const r = await api.importCsv(kind, csvText);
      flash(`导入成功 ${r.created} 条${r.errors.length ? `，失败 ${r.errors.length} 条：${r.errors.slice(0, 3).join('；')}` : ''}`);
      setImportOpen(false); setCsvText('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '导入失败');
    }
  }

  function exportCsv() {
    let header = '';
    let rows: string[][] = [];
    if (tab === 'materials') {
      header = '编码,名称,分类,单位,规格';
      rows = materials.map((m) => [m.code, m.name, m.categoryPath, m.unit, m.spec ?? '']);
    } else {
      const list = tab === 'suppliers' ? suppliers : customers;
      header = '编码,名称,类型,联系人,电话,邮箱';
      rows = list.map((p) => [p.code, p.name, p.type ?? '', p.contact ?? '', p.phone ?? '', p.email ?? '']);
    }
    const csv = [header, ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const csvEnabled = ['materials', 'suppliers', 'customers'].includes(tab);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>基础数据</h1>
          <div className="sub">物料 / 供应商 / 客户 / 缺陷库 / 检验方法 / 计量单位（主数据）</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {csvEnabled && <button className="btn" onClick={exportCsv}>导出 CSV</button>}
          {csvEnabled && canEdit && <button className="btn" onClick={() => setImportOpen(true)}>导入 CSV</button>}
          {canEdit && <button className="btn primary" onClick={() => setEditing({})}>+ 新建</button>}
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {ok && <div className="alert ok">{ok}</div>}

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => { setTab(t.id); setEditing(null); }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="card">
        {tab === 'materials' && (
          <table className="tbl">
            <thead><tr><th>编码</th><th>名称</th><th>分类</th><th>单位</th><th>绑定检验标准</th><th>状态</th>{canEdit && <th></th>}</tr></thead>
            <tbody>
              {materials.map((m) => (
                <tr key={m.id}>
                  <td>{m.code}{m.demo && <span className="badge gray" style={{ marginLeft: 6 }}>演示</span>}</td>
                  <td>{m.name}</td>
                  <td>{m.categoryPath}</td>
                  <td>{m.unit}</td>
                  <td>{standards.find((s) => s.id === m.standardId)?.name ?? <span className="badge amber">未绑定</span>}</td>
                  <td>{m.active ? <span className="badge green">启用</span> : <span className="badge gray">停用</span>}</td>
                  {canEdit && (
                    <td><button className="btn sm" onClick={() => setEditing({ id: m.id, code: m.code, name: m.name, categoryPath: m.categoryPath, unit: m.unit, spec: m.spec ?? '', standardId: m.standardId ?? '' })}>编辑</button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {(tab === 'suppliers' || tab === 'customers') && (
          <table className="tbl">
            <thead><tr><th>编码</th><th>名称</th><th>类型</th><th>联系人</th><th>电话</th><th>邮箱</th>{canEdit && <th></th>}</tr></thead>
            <tbody>
              {(tab === 'suppliers' ? suppliers : customers).map((p) => (
                <tr key={p.id}>
                  <td>{p.code}{p.demo && <span className="badge gray" style={{ marginLeft: 6 }}>演示</span>}</td>
                  <td>{p.name}</td>
                  <td>{p.type ?? '—'}</td>
                  <td>{p.contact ?? '—'}</td>
                  <td>{p.phone ?? '—'}</td>
                  <td>{p.email ?? '—'}</td>
                  {canEdit && (
                    <td><button className="btn sm" onClick={() => setEditing({ id: p.id, code: p.code, name: p.name, type: p.type ?? '', contact: p.contact ?? '', phone: p.phone ?? '', email: p.email ?? '' })}>编辑</button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'defects' && (
          <table className="tbl">
            <thead><tr><th>代码</th><th>名称</th><th>严重度</th><th className="num">扣分</th>{canEdit && <th></th>}</tr></thead>
            <tbody>
              {defects.map((d) => (
                <tr key={d.id}>
                  <td>{d.code}</td>
                  <td>{d.name}</td>
                  <td><span className={`badge ${d.severity === 'Cr' ? 'red' : d.severity === 'Ma' ? 'amber' : 'gray'}`}>{SEVERITY_NAMES[d.severity]}</span></td>
                  <td className="num">{d.score}</td>
                  {canEdit && <td><button className="btn sm" onClick={() => setEditing({ id: d.id, code: d.code, name: d.name, severity: d.severity, score: String(d.score) })}>编辑</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'methods' && (
          <table className="tbl">
            <thead><tr><th>方法名称</th><th>量具/设备</th>{canEdit && <th></th>}</tr></thead>
            <tbody>
              {methods.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td><td>{m.instrument ?? '—'}</td>
                  {canEdit && <td><button className="btn sm" onClick={() => setEditing({ id: m.id, name: m.name, instrument: m.instrument ?? '' })}>编辑</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'units' && (
          <table className="tbl">
            <thead><tr><th>名称</th><th>符号</th>{canEdit && <th></th>}</tr></thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td><td>{u.symbol}</td>
                  {canEdit && <td><button className="btn sm" onClick={() => setEditing({ id: u.id, name: u.name, symbol: u.symbol })}>编辑</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <div className="modal-mask" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editing.id ? '编辑' : '新建'}{TABS.find((t) => t.id === tab)?.label}</h2>
            {tab === 'materials' && (
              <>
                <Field label="物料编码 *" v={editing.code} set={(v) => setEditing({ ...editing, code: v })} />
                <Field label="物料名称 *" v={editing.name} set={(v) => setEditing({ ...editing, name: v })} />
                <Field label="分类路径 *（如：换流阀组部件/关键件）" v={editing.categoryPath} set={(v) => setEditing({ ...editing, categoryPath: v })} />
                <Field label="计量单位" v={editing.unit} set={(v) => setEditing({ ...editing, unit: v })} />
                <Field label="规格描述" v={editing.spec} set={(v) => setEditing({ ...editing, spec: v })} />
                <div className="field">
                  <label>绑定检验标准</label>
                  <select value={editing.standardId ?? ''} onChange={(e) => setEditing({ ...editing, standardId: e.target.value })}>
                    <option value="">不绑定（不可报检）</option>
                    {standards.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.code} {s.name}</option>)}
                  </select>
                </div>
              </>
            )}
            {(tab === 'suppliers' || tab === 'customers') && (
              <>
                <Field label="编码 *" v={editing.code} set={(v) => setEditing({ ...editing, code: v })} />
                <Field label="名称 *" v={editing.name} set={(v) => setEditing({ ...editing, name: v })} />
                <Field label="类型" v={editing.type} set={(v) => setEditing({ ...editing, type: v })} />
                <Field label="联系人" v={editing.contact} set={(v) => setEditing({ ...editing, contact: v })} />
                <Field label="电话" v={editing.phone} set={(v) => setEditing({ ...editing, phone: v })} />
                <Field label="邮箱" v={editing.email} set={(v) => setEditing({ ...editing, email: v })} />
              </>
            )}
            {tab === 'defects' && (
              <>
                <Field label="缺陷代码 *" v={editing.code} set={(v) => setEditing({ ...editing, code: v })} />
                <Field label="缺陷名称 *" v={editing.name} set={(v) => setEditing({ ...editing, name: v })} />
                <div className="field">
                  <label>严重度 *</label>
                  <select value={editing.severity ?? 'Mi'} onChange={(e) => setEditing({ ...editing, severity: e.target.value })}>
                    <option value="Cr">致命缺陷 Cr（10 分）</option>
                    <option value="Ma">严重缺陷 Ma（5 分）</option>
                    <option value="Mi">轻微缺陷 Mi（1 分）</option>
                  </select>
                </div>
                <Field label="扣分（留空按严重度默认）" v={editing.score} set={(v) => setEditing({ ...editing, score: v })} />
              </>
            )}
            {tab === 'methods' && (
              <>
                <Field label="方法名称 *" v={editing.name} set={(v) => setEditing({ ...editing, name: v })} />
                <Field label="量具/设备" v={editing.instrument} set={(v) => setEditing({ ...editing, instrument: v })} />
              </>
            )}
            {tab === 'units' && (
              <>
                <Field label="单位名称 *" v={editing.name} set={(v) => setEditing({ ...editing, name: v })} />
                <Field label="符号" v={editing.symbol} set={(v) => setEditing({ ...editing, symbol: v })} />
              </>
            )}
            <div className="actions">
              <button className="btn" onClick={() => setEditing(null)}>取消</button>
              <button className="btn primary" onClick={save}>保存</button>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="modal-mask" onClick={() => setImportOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>CSV 批量导入</h2>
            <div className="alert info">
              {tab === 'materials'
                ? '表头：编码,名称,分类,单位,规格（首行为表头，逗号分隔）'
                : '表头：编码,名称,类型,联系人,电话,邮箱（首行为表头，逗号分隔）'}
            </div>
            <div className="field">
              <label>选择 CSV 文件或直接粘贴内容</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const reader = new FileReader();
                  reader.onload = () => setCsvText(String(reader.result));
                  reader.readAsText(f, 'utf-8');
                }}
              />
            </div>
            <textarea rows={8} value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder="编码,名称,分类,单位,规格&#10;CV-99,示例物料,换流阀组部件/一般件,件,示例" />
            <div className="actions">
              <button className="btn" onClick={() => setImportOpen(false)}>取消</button>
              <button className="btn primary" onClick={doImport} disabled={!csvText.trim()}>导入</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, v, set }: { label: string; v?: string; set: (v: string) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type="text" value={v ?? ''} onChange={(e) => set(e.target.value)} />
    </div>
  );
}

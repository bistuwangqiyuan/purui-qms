import React, { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Role, User } from '../../shared/types';
import { ROLE_NAMES } from '../../shared/types';
import { api } from '../api';

export default function Users() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('inspector');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState('');

  const load = useCallback(() => {
    api.users().then(setUsers).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(''); setOk(''); setBusy(true);
    try {
      await api.createUser({ username, name, role, password });
      setOk(`用户 ${username} 创建成功`);
      setUsername(''); setName(''); setPassword('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u: User) {
    setError(''); setOk('');
    try {
      await api.updateUser(u.username, { active: !u.active });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  }

  async function confirmReset() {
    if (!resetFor) return;
    setError(''); setOk('');
    if (resetPw.length < 8) {
      setError('新密码至少 8 位');
      return;
    }
    try {
      await api.updateUser(resetFor, { password: resetPw });
      setOk(`用户 ${resetFor} 密码已重置`);
      setResetFor(null);
      setResetPw('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>用户管理</h1>
          <div className="sub">三级角色：检验员（录入）· 质量工程师（审核处置）· 管理员（系统管理）</div>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {ok && <div className="alert ok">{ok}</div>}

      <div className="grid cols-2">
        <div className="card">
          <h2>用户列表</h2>
          {!users ? (
            <div className="empty">加载中…</div>
          ) : (
            <table className="tbl">
              <thead>
                <tr><th>用户名</th><th>姓名</th><th>角色</th><th>状态</th><th>操作</th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <React.Fragment key={u.id}>
                    <tr>
                      <td>{u.username}</td>
                      <td>{u.name}</td>
                      <td><span className="badge blue">{ROLE_NAMES[u.role]}</span></td>
                      <td>{u.active ? <span className="badge green">启用</span> : <span className="badge gray">停用</span>}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn sm" onClick={() => toggleActive(u)}>{u.active ? '停用' : '启用'}</button>{' '}
                        <button
                          className="btn sm"
                          onClick={() => {
                            setResetFor(resetFor === u.username ? null : u.username);
                            setResetPw('');
                          }}
                        >
                          重置密码
                        </button>
                      </td>
                    </tr>
                    {resetFor === u.username && (
                      <tr>
                        <td colSpan={5} style={{ background: '#f8fbfd' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13 }}>为 <strong>{u.username}</strong> 设置新密码：</span>
                            <input
                              type="password"
                              value={resetPw}
                              onChange={(e) => setResetPw(e.target.value)}
                              placeholder="至少 8 位"
                              style={{ maxWidth: 200 }}
                              autoFocus
                            />
                            <button className="btn sm primary" onClick={confirmReset}>确认重置</button>
                            <button className="btn sm" onClick={() => { setResetFor(null); setResetPw(''); }}>取消</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <form className="card" onSubmit={onCreate}>
          <h2>新建用户</h2>
          <div className="field">
            <label>用户名 *</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required pattern="[a-zA-Z0-9_]{3,20}" />
            <div className="hint">3–20 位字母、数字或下划线</div>
          </div>
          <div className="field">
            <label>姓名 *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>角色 *</label>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="inspector">检验员</option>
              <option value="qe">质量工程师</option>
              <option value="admin">管理员</option>
            </select>
          </div>
          <div className="field">
            <label>初始密码 *</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            <div className="hint">至少 8 位</div>
          </div>
          <button className="btn primary" disabled={busy}>{busy ? '创建中…' : '创建用户'}</button>
        </form>
      </div>
    </>
  );
}

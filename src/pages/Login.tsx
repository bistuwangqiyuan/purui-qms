import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-visual">
        <img src="/images/hero-transmission.jpg" alt="高压输电线路" />
        <div className="veil" />
        <div className="text">
          <h2>换流阀组部件来料检验质量管理系统</h2>
          <p>
            面向换流阀晶闸管、阀电抗器、阻尼电容器等组部件的来料检验（IQC）全流程管理：
            按 GB/T 2828.1-2012 自动检索抽样方案，检验结果在线录入与上传，
            质量工程师审核与 MRB 处置全程留痕，供应商质量数据可视化。
          </p>
        </div>
        <div className="credit">
          图片来源：Unsplash（Unsplash License 免费商用），详见"标准与依据"页
        </div>
      </div>
      <div className="login-form-side">
        <form className="login-form" onSubmit={onSubmit}>
          <div className="logo-row">
            <div className="logo-mark">QMS</div>
            <div>
              <h1 style={{ fontSize: 19, margin: 0 }}>普瑞 QMS</h1>
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>中电普瑞电力工程有限公司 · 来料检验</div>
            </div>
          </div>
          {error && <div className="alert error">{error}</div>}
          <div className="field">
            <label>用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="field">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
            {busy ? '登录中…' : '登 录'}
          </button>
          <div className="demo-accounts">
            <div style={{ fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>演示账号（角色分离）</div>
            <div>检验员：<code>inspector</code> / <code>Insp@123</code></div>
            <div>质量工程师：<code>qe</code> / <code>Qe@123456</code></div>
            <div>管理员：<code>admin</code> / <code>Admin@123</code></div>
          </div>
        </form>
      </div>
    </div>
  );
}

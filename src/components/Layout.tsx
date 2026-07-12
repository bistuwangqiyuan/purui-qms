import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth';
import { ROLE_NAMES } from '../../shared/types';

export default function Layout() {
  const { user, logout } = useAuth();
  if (!user) return null;

  const canInspect = user.role === 'inspector' || user.role === 'admin';

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">
            <div className="logo-mark">QMS</div>
            <div>
              <div className="t1">普瑞 QMS</div>
              <div className="t2">换流阀来料检验质量管理</div>
            </div>
          </div>
        </div>
        <nav className="nav">
          <div className="group">质量业务</div>
          <NavLink to="/" end>工作台</NavLink>
          {canInspect && <NavLink to="/batches/new">来料登记</NavLink>}
          <NavLink to="/batches">批次台账</NavLink>
          <div className="group">体系与依据</div>
          <NavLink to="/standards">标准与依据</NavLink>
          {user.role === 'admin' && (
            <>
              <div className="group">系统管理</div>
              <NavLink to="/users">用户管理</NavLink>
            </>
          )}
        </nav>
        <div className="foot">
          <div className="name">{user.name}</div>
          <div>{ROLE_NAMES[user.role]} · {user.username}</div>
          <button onClick={logout}>退出登录</button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

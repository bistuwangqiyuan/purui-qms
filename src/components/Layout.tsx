import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth';
import { ROLE_NAMES, USER_TYPE_NAMES } from '../../shared/types';
import { api } from '../api';

export default function Layout() {
  const { user, logout } = useAuth();
  const [unread, setUnread] = useState(0);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api.messages().then((ms) => alive && setUnread(ms.filter((m) => !m.read).length)).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!user) return null;
  const userType = user.userType ?? 'internal';
  const isInternal = userType === 'internal';
  const canInspect = isInternal && (user.role === 'inspector' || user.role === 'admin');
  const isQe = isInternal && (user.role === 'qe' || user.role === 'admin');

  const close = () => setNavOpen(false);

  return (
    <div className="layout">
      <button className="mobile-nav-toggle no-print" onClick={() => setNavOpen(!navOpen)}>☰ 菜单</button>
      <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="logo">
            <div className="logo-mark">QMS</div>
            <div>
              <div className="t1">普瑞 QMS</div>
              <div className="t2">换流阀质量管理系统</div>
            </div>
          </div>
        </div>
        <nav className="nav" onClick={close}>
          {isInternal ? (
            <>
              <div className="group">质量驾驶舱</div>
              <NavLink to="/" end>工作台</NavLink>
              <NavLink to="/spc">SPC 质量报表</NavLink>
              <NavLink to="/trace">全景追溯</NavLink>
              <div className="group">检验业务</div>
              {canInspect && <NavLink to="/batches/new">报检登记</NavLink>}
              <NavLink to="/batches">检验台账</NavLink>
              <NavLink to="/patrol">巡检计划</NavLink>
              <NavLink to="/standards-mgmt">检验标准</NavLink>
              <div className="group">质量改进</div>
              <NavLink to="/ncrs">不合格品</NavLink>
              <NavLink to="/complaints">客户投诉</NavLink>
              <NavLink to="/capa">CAPA 整改</NavLink>
              <NavLink to="/issues">问题发现</NavLink>
              <div className="group">体系管理</div>
              <NavLink to="/audits">评审管理</NavLink>
              <NavLink to="/tests">周期试验</NavLink>
              <NavLink to="/gauges">量具管理</NavLink>
              <NavLink to="/costs">质量成本</NavLink>
              <div className="group">协同</div>
              <NavLink to="/tasks">我的任务</NavLink>
              <NavLink to="/messages">消息中心{unread > 0 && <span className="badge red" style={{ marginLeft: 6 }}>{unread}</span>}</NavLink>
              <div className="group">系统</div>
              <NavLink to="/basic-data">基础数据</NavLink>
              {user.role === 'admin' && <NavLink to="/users">用户管理</NavLink>}
              <NavLink to="/standards">标准与依据</NavLink>
            </>
          ) : userType === 'supplier' ? (
            <>
              <div className="group">供应商协同</div>
              <NavLink to="/batches">我的来料批次</NavLink>
              <NavLink to="/ncrs">不合格品通报</NavLink>
              <NavLink to="/capa">整改任务</NavLink>
              <NavLink to="/messages">消息中心</NavLink>
            </>
          ) : (
            <>
              <div className="group">客户协同</div>
              <NavLink to="/complaints">我的投诉</NavLink>
              <NavLink to="/messages">消息中心</NavLink>
            </>
          )}
        </nav>
        <div className="foot">
          <div className="name">{user.name}</div>
          <div>{isInternal ? ROLE_NAMES[user.role] : USER_TYPE_NAMES[userType]} · {user.username}</div>
          <button onClick={logout}>退出登录</button>
        </div>
      </aside>
      <main className="main" onClick={close}>
        <Outlet />
      </main>
    </div>
  );
}

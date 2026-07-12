import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { TaskItem } from '../../shared/types';
import { api } from '../api';

const KIND_COLOR: Record<string, string> = {
  待检验: 'blue', 待审核: 'amber', 整改: 'red', 评审: 'violet', 试验: 'violet', 校准: 'amber', 客诉: 'red', 不合格品: 'red',
};

export default function Tasks() {
  const [tasks, setTasks] = useState<TaskItem[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api.tasks().then(setTasks).catch((e) => setError(e.message));
  }, []);

  const kinds = [...new Set((tasks ?? []).map((t) => t.kind))];
  const filtered = (tasks ?? []).filter((t) => !filter || t.kind === filter);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>我的任务</h1>
          <div className="sub">待检验 / 待审核 / 整改 / 评审 / 试验 / 校准 / 客诉 / 不合格品 全局聚合（方案 4.2.2 工作台）</div>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="tabs">
        <button className={filter === '' ? 'active' : ''} onClick={() => setFilter('')}>全部（{tasks?.length ?? 0}）</button>
        {kinds.map((k) => (
          <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>
            {k}（{tasks?.filter((t) => t.kind === k).length}）
          </button>
        ))}
      </div>

      <div className="card">
        {!tasks ? (
          <div className="empty">加载中…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">没有待办任务，干得漂亮！</div>
        ) : (
          <table className="tbl">
            <thead><tr><th>类型</th><th>任务</th><th>期限</th><th></th></tr></thead>
            <tbody>
              {filtered.map((t, i) => (
                <tr key={i}>
                  <td><span className={`badge ${KIND_COLOR[t.kind] ?? 'gray'}`}>{t.kind}</span></td>
                  <td>{t.title}</td>
                  <td>{t.due ? (t.overdue ? <span className="badge red">{t.due} 已逾期</span> : t.due) : '—'}</td>
                  <td><Link className="btn sm" to={t.link}>去处理</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

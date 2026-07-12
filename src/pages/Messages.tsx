import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Message } from '../../shared/types';
import { api } from '../api';

const KIND_LABEL: Record<string, { label: string; color: string }> = {
  warning: { label: '预警', color: 'red' },
  task: { label: '任务', color: 'blue' },
  approval: { label: '审批', color: 'amber' },
  info: { label: '通知', color: 'gray' },
};

export default function Messages() {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.messages().then(setMessages).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function markRead(m: Message) {
    if (m.read) return;
    try {
      await api.readMessage(m.id);
      load();
    } catch {
      /* 忽略 */
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>消息中心</h1>
          <div className="sub">预警通知 / 任务通知 / 审批通知 统一收件箱（替代方案中的邮件与企业微信通知）</div>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        {!messages ? (
          <div className="empty">加载中…</div>
        ) : messages.length === 0 ? (
          <div className="empty">暂无消息</div>
        ) : (
          <table className="tbl">
            <thead><tr><th></th><th>类型</th><th>标题</th><th>内容</th><th>时间</th><th></th></tr></thead>
            <tbody>
              {messages.map((m) => {
                const k = KIND_LABEL[m.kind] ?? KIND_LABEL.info;
                return (
                  <tr key={m.id} style={m.read ? { opacity: 0.65 } : undefined}>
                    <td>{!m.read && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--bad)' }} />}</td>
                    <td><span className={`badge ${k.color}`}>{k.label}</span></td>
                    <td style={{ fontWeight: m.read ? 400 : 600 }}>{m.title}</td>
                    <td style={{ maxWidth: 420 }}>{m.body}</td>
                    <td>{new Date(m.createdAt).toLocaleString('zh-CN')}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {m.link && <Link className="btn sm" to={m.link} onClick={() => markRead(m)}>查看</Link>}{' '}
                      {!m.read && <button className="btn sm" onClick={() => markRead(m)}>已读</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

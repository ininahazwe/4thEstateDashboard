import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { NotificationItem } from '../api/types';

// Simple polling instead of WebSockets for now (brief §2.3/§4.7 mentions
// real-time collaboration as a separate, not-yet-built Phase 2 item) — good
// enough for "did something happen since I last looked", refreshed while
// the tab is open.
const POLL_INTERVAL_MS = 30_000;

function describeNotification(n: NotificationItem): string {
  const p = n.payload ?? {};
  const actor = p.actorName ?? 'Someone';
  const caseTitle = p.caseTitle ?? 'a case';

  switch (n.type) {
    case 'new_action':
      return `${actor} commented on "${caseTitle}"`;
    case 'access_granted':
      return p.event === 'role_changed'
        ? `Your role on "${caseTitle}" changed${p.role ? ` to ${p.role}` : ''}`
        : `You were added to "${caseTitle}"${p.role ? ` as ${p.role}` : ''}`;
    case 'sensitivity_increased':
      return `"${caseTitle}" sensitivity was raised${p.to ? ` to ${p.to}` : ''}`;
    case 'mention':
      return `${actor} mentioned you in "${caseTitle}"`;
    case 'deadline_approaching':
      return `"${caseTitle}" is approaching its deadline`;
    default:
      return `Activity on "${caseTitle}"`;
  }
}

export function NotificationsBell() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  async function loadUnreadCount() {
    try {
      const { count } = await api.get<{ count: number }>('/notifications/unread-count');
      setUnreadCount(count);
    } catch {
      // Silent — the bell just skips this refresh rather than surfacing an
      // error for a background poll the user didn't initiate.
    }
  }

  async function loadNotifications() {
    try {
      const data = await api.get<NotificationItem[]>('/notifications');
      setNotifications(data);
    } catch {
      // Silent, same reasoning as above.
    }
  }

  useEffect(() => {
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      await loadNotifications();
    }
  }

  async function handleItemClick(n: NotificationItem) {
    if (!n.read) {
      try {
        await api.put(`/notifications/${n.id}/read`);
        setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)));
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // Navigation still happens even if marking-as-read failed.
      }
    }
    setOpen(false);
    if (n.payload?.caseId) {
      navigate(`/cases/${n.payload.caseId}`);
    }
  }

  async function handleMarkAllRead() {
    try {
      await api.put('/notifications/read-all');
      setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
      setUnreadCount(0);
    } catch {
      // ignore — the next poll will reconcile
    }
  }

  return (
    <div className="notifications-bell" ref={containerRef}>
      <button
        type="button"
        onClick={handleToggle}
        className="btn-secondary notifications-bell-toggle"
        aria-label="Notifications"
      >
        Notifications{unreadCount > 0 && <span className="notifications-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (
        <div className="notifications-dropdown">
          <div className="notifications-dropdown-header">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <button type="button" onClick={handleMarkAllRead} className="btn-tiny">
                Mark all as read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="empty-state notifications-empty">No notifications yet</p>
          ) : (
            <ul className="notifications-list">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleItemClick(n)}
                    className={`notifications-item${n.read ? '' : ' notifications-item-unread'}`}
                  >
                    <span className="notifications-item-text">{describeNotification(n)}</span>
                    <span className="notifications-item-time">{new Date(n.createdAt).toLocaleString()}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

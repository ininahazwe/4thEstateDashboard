import { RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';

// Matches the `type` ENUM on the pre-existing `notifications` table (found
// in the DB, not in any migration file we wrote — likely part of the
// original schema.sql, brief §2.3). Only 'new_action', 'access_granted'
// and 'sensitivity_increased' are wired up so far:
// - 'mention' would need comment mentions to reference platform users
//   (today `comments.mentions` only references contacts/events, brief
//   §4.5) — not built yet.
// - 'deadline_approaching' needs a scheduled/periodic check against
//   `cases.due_date`, not just a hook on some other write — not built yet.
export type NotificationType =
  | 'new_action'
  | 'mention'
  | 'deadline_approaching'
  | 'sensitivity_increased'
  | 'access_granted';

interface NotificationRow extends RowDataPacket {
  id: number;
  user_id: number;
  type: NotificationType;
  payload: unknown;
  is_read: number;
  created_at: string;
}

function mapNotification(row: NotificationRow) {
  return {
    id: row.id,
    type: row.type,
    payload: (row.payload ?? null) as Record<string, unknown> | null,
    read: !!row.is_read,
    createdAt: row.created_at,
  };
}

// The table has no case_id/actor_id/resource columns of its own — whatever
// context a notification needs (which case, whose name, what changed) is
// denormalized into `payload` at write time by the caller. That's a
// deliberate tradeoff: simpler schema, and the notification keeps showing
// the case's title/role/etc. as they were at the time even if the case is
// later renamed or the contributor's role changes again.
export interface NotifyOptions {
  actorId?: number;
  payload?: Record<string, unknown>;
}

// Writes one notification row per recipient. Called from other service
// modules right after the write that triggers it — never exposed as its
// own route. The actor never gets notified about their own action.
export async function notifyUsers(
  recipientIds: number[],
  type: NotificationType,
  options: NotifyOptions = {}
): Promise<void> {
  const recipients = [...new Set(recipientIds)].filter((id) => id !== options.actorId);
  if (recipients.length === 0) return;

  await Promise.all(
    recipients.map((userId) =>
      pool.query(
        `INSERT INTO notifications (user_id, type, payload) VALUES (:userId, :type, :payload)`,
        {
          userId,
          type,
          payload: options.payload ? JSON.stringify(options.payload) : null,
        }
      )
    )
  );
}

// Small helper so callers can stick a human-readable actor name into a
// notification's payload without threading it through every function
// signature between the route (which has req.user.fullName) and here.
export async function getUserFullName(userId?: number): Promise<string | null> {
  if (!userId) return null;
  const [rows] = await pool.query<RowDataPacket[]>('SELECT full_name FROM users WHERE id = :userId', {
    userId,
  });
  return (rows[0]?.full_name as string | undefined) ?? null;
}

// Most recent 100 notifications for a user, newest first. `unreadOnly`
// narrows to just the ones not yet acknowledged.
export async function listMyNotifications(userId: number, unreadOnly = false) {
  const [rows] = await pool.query<NotificationRow[]>(
    `SELECT id, user_id, type, payload, is_read, created_at
     FROM notifications
     WHERE user_id = :userId ${unreadOnly ? 'AND is_read = 0' : ''}
     ORDER BY created_at DESC
     LIMIT 100`,
    { userId }
  );

  return rows.map(mapNotification);
}

export async function countUnread(userId: number): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT COUNT(*) AS n FROM notifications WHERE user_id = :userId AND is_read = 0',
    { userId }
  );
  return Number(rows[0]?.n ?? 0);
}

// Returns whether the notification exists and belongs to this user (so the
// route can answer 404 vs 204). Idempotent: marking an already-read
// notification as read again still returns true rather than 404.
export async function markAsRead(notificationId: number, userId: number): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM notifications WHERE id = :notificationId AND user_id = :userId',
    { notificationId, userId }
  );
  if (!rows[0]) return false;

  await pool.query('UPDATE notifications SET is_read = 1 WHERE id = :notificationId', { notificationId });
  return true;
}

export async function markAllAsRead(userId: number): Promise<void> {
  await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = :userId AND is_read = 0', {
    userId,
  });
}

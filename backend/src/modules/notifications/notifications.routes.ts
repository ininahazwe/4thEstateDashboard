import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { parseId } from '../../utils/parseId';
import { requireAuth } from '../../middleware/auth';
import { countUnread, listMyNotifications, markAllAsRead, markAsRead } from './notifications.service';

// Mounted at /api/notifications in app.ts. Not case-scoped (unlike most
// other routers here) — this lists a user's own notifications across all
// their cases, so it only needs requireAuth, not requireCaseRole.
export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const unreadOnly = req.query.unreadOnly === 'true';
    res.json(await listMyNotifications(req.user!.id, unreadOnly));
  })
);

notificationsRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    res.json({ count: await countUnread(req.user!.id) });
  })
);

notificationsRouter.put(
  '/read-all',
  asyncHandler(async (req, res) => {
    await markAllAsRead(req.user!.id);
    res.status(204).send();
  })
);

notificationsRouter.put(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'notification id');
    const found = await markAsRead(id, req.user!.id);
    if (!found) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }
    res.status(204).send();
  })
);

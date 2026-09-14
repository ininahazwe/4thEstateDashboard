import { Server as SocketIOServer, Socket } from 'socket.io';
import type { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { RowDataPacket } from 'mysql2';
import { env } from '../config/env';
import { pool } from '../config/db';
import { AuthUser } from '../middleware/auth';

// "Presence simple" (brief §4.7, scope agreed with Yv: no live cursors —
// just who's currently looking at a case). In-memory only, deliberately not
// persisted: it's a snapshot of who's connected right now, not a fact worth
// keeping in the database, and it naturally clears itself on server
// restart or when everyone disconnects.

interface PresenceEntry {
  userId: number;
  fullName: string;
}

// caseId -> userId -> the set of that user's open socket connections (a
// user can have the case open in more than one tab/device at once; they
// should still show up only once in the presence list).
const presenceByCase = new Map<number, Map<number, { fullName: string; socketIds: Set<string> }>>();

function broadcastPresence(io: SocketIOServer, caseId: number) {
  const users = presenceByCase.get(caseId);
  const list: PresenceEntry[] = users
    ? [...users.entries()].map(([userId, { fullName }]) => ({ userId, fullName }))
    : [];
  io.to(`case:${caseId}`).emit('case:presence', list);
}

function addPresence(caseId: number, user: AuthUser, socketId: string) {
  let users = presenceByCase.get(caseId);
  if (!users) {
    users = new Map();
    presenceByCase.set(caseId, users);
  }
  const existing = users.get(user.id);
  if (existing) {
    existing.socketIds.add(socketId);
  } else {
    users.set(user.id, { fullName: user.fullName, socketIds: new Set([socketId]) });
  }
}

// Returns true if this was the user's last open socket on this case (i.e.
// they actually disappeared from the presence list, not just closed one of
// several tabs) — the caller only needs to broadcast in that case.
function removePresence(caseId: number, userId: number, socketId: string): boolean {
  const users = presenceByCase.get(caseId);
  if (!users) return false;
  const entry = users.get(userId);
  if (!entry) return false;

  entry.socketIds.delete(socketId);
  if (entry.socketIds.size === 0) {
    users.delete(userId);
    if (users.size === 0) {
      presenceByCase.delete(caseId);
    }
    return true;
  }
  return false;
}

// Same access rule as requireCaseRole('read_only') in middleware/auth.ts,
// duplicated here rather than imported: that middleware is shaped around
// Express's (req, res, next), not a plain boolean check a socket handler
// can await.
async function userHasCaseAccess(userId: number, caseId: number): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT 1 FROM case_contributors WHERE case_id = :caseId AND user_id = :userId',
    { caseId, userId }
  );
  return rows.length > 0;
}

// Wires up Socket.io on the existing HTTP server (see server.ts) for
// presence only — no other realtime feature uses this yet.
export function attachPresence(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: env.FRONTEND_URL },
  });

  // Verifies the same JWT issued at login (middleware/auth.ts's
  // requireAuth) — a socket with no valid token is rejected before any
  // event handler runs.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error('Missing auth token'));
      return;
    }
    try {
      socket.data.user = jwt.verify(token, env.JWT_SECRET) as AuthUser;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as AuthUser;
    const joinedCases = new Set<number>();

    socket.on('case:join', async (payload: { caseId?: number }) => {
      const caseId = Number(payload?.caseId);
      if (!Number.isInteger(caseId) || caseId <= 0) return;

      const hasAccess = await userHasCaseAccess(user.id, caseId);
      if (!hasAccess) return;

      socket.join(`case:${caseId}`);
      joinedCases.add(caseId);
      addPresence(caseId, user, socket.id);
      broadcastPresence(io, caseId);
    });

    socket.on('case:leave', (payload: { caseId?: number }) => {
      const caseId = Number(payload?.caseId);
      if (!Number.isInteger(caseId)) return;

      socket.leave(`case:${caseId}`);
      joinedCases.delete(caseId);
      if (removePresence(caseId, user.id, socket.id)) {
        broadcastPresence(io, caseId);
      }
    });

    socket.on('disconnect', () => {
      for (const caseId of joinedCases) {
        if (removePresence(caseId, user.id, socket.id)) {
          broadcastPresence(io, caseId);
        }
      }
    });
  });

  return io;
}

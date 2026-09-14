import { io, Socket } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';
// Socket.io shares the backend's HTTP port but isn't under /api (see
// server.ts — it's attached to the same http.Server as Express, at its
// default /socket.io/ path), so the trailing /api has to come off first.
const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');

let socket: Socket | null = null;

// Lazily creates (or reuses) a single shared, authenticated socket
// connection. Every page that needs realtime presence calls this instead
// of opening its own connection, so navigating between cases doesn't pile
// up sockets.
export function getSocket(token: string): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, { auth: { token } });
    return socket;
  }

  const currentToken = (socket.auth as { token?: string } | undefined)?.token;
  if (currentToken !== token) {
    // Token changed (re-login as someone else, token refresh) — reconnect
    // with the new one rather than keep authenticating as the old user.
    socket.auth = { token };
    socket.disconnect();
    socket.connect();
  }

  return socket;
}

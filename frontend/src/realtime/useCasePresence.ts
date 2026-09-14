import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getSocket } from './socket';

export interface PresenceUser {
  userId: number;
  fullName: string;
}

// "Presence simple" (brief §4.7, scope agreed with Yv — no live cursors,
// just who's currently looking at this case). Joins the case's room on
// mount, listens for presence updates, and leaves on unmount/case change.
export function useCasePresence(caseId: number | undefined): PresenceUser[] {
  const { token } = useAuth();
  const [users, setUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!caseId || !token) {
      setUsers([]);
      return;
    }

    const socket = getSocket(token);

    function handlePresence(list: PresenceUser[]) {
      setUsers(list);
    }

    socket.on('case:presence', handlePresence);
    socket.emit('case:join', { caseId });

    return () => {
      socket.off('case:presence', handlePresence);
      socket.emit('case:leave', { caseId });
      setUsers([]);
    };
  }, [caseId, token]);

  return users;
}

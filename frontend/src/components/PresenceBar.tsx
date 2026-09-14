import { useAuth } from '../auth/AuthContext';
import { PresenceUser } from '../realtime/useCasePresence';

// Renders nothing when no one (including the current user) is present yet
// — e.g. the socket hasn't connected/joined the room. Once it has, the
// current user always shows up in their own list, tagged "(you)".
export function PresenceBar({ users }: { users: PresenceUser[] }) {
  const { user } = useAuth();

  if (users.length === 0) return null;

  const labels = users.map((u) => (u.userId === user?.id ? `${u.fullName} (you)` : u.fullName));

  return (
    <div className="presence-bar">
      <span className="presence-dot" aria-hidden="true" />
      <span>
        Currently viewing: <strong>{labels.join(', ')}</strong>
      </span>
    </div>
  );
}

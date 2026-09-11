import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

// Landing point for the Google OAuth redirect: the backend sends the
// browser here with either ?token=... (success) or ?error=... (failure)
// after exchanging the authorization code (see backend
// modules/auth/auth.controller.ts -> googleCallbackHandler).
export function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get('token');
    const oauthError = searchParams.get('error');

    if (oauthError) {
      setError(oauthError);
      return;
    }

    if (!token) {
      setError('Aucun token reçu.');
      return;
    }

    loginWithToken(token)
      .then(() => navigate('/cases', { replace: true }))
      .catch(() => setError('La connexion a échoué.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        {error ? (
          <>
            <p className="form-error">{error}</p>
            <a className="btn-secondary" href="/login">
              Réessayer
            </a>
          </>
        ) : (
          <p>Connexion en cours...</p>
        )}
      </div>
    </div>
  );
}

import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { TotpEnableResponse, TotpSetupResponse, TotpStatus } from '../api/types';
import { NotificationsBell } from '../components/NotificationsBell';
import { useAuth } from '../auth/AuthContext';

// Account-level 2FA management (brief §5.2). Enrollment is two steps against
// the backend: POST /setup returns a fresh secret + QR code (not yet active),
// then POST /enable with the code the user's app is showing turns it on and
// returns one-time recovery codes -- shown here exactly once, never again.
export function SecuritySettingsPage() {
  const { user, logout } = useAuth();
  const [status, setStatus] = useState<TotpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [setupData, setSetupData] = useState<TotpSetupResponse | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupSubmitting, setSetupSubmitting] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const [disableCode, setDisableCode] = useState('');
  const [disableError, setDisableError] = useState<string | null>(null);
  const [disableSubmitting, setDisableSubmitting] = useState(false);
  const [showDisableForm, setShowDisableForm] = useState(false);

  const [showPanicConfirm, setShowPanicConfirm] = useState(false);
  const [panicSubmitting, setPanicSubmitting] = useState(false);
  const [panicError, setPanicError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<TotpStatus>('/auth/2fa');
      setStatus(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load two-factor authentication status');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleStartSetup() {
    setSetupError(null);
    setRecoveryCodes(null);
    try {
      const data = await api.post<TotpSetupResponse>('/auth/2fa/setup');
      setSetupData(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to start two-factor setup');
    }
  }

  async function handleConfirmSetup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSetupSubmitting(true);
    setSetupError(null);
    try {
      const data = await api.post<TotpEnableResponse>('/auth/2fa/enable', { code: setupCode.trim() });
      setRecoveryCodes(data.recoveryCodes);
      setSetupData(null);
      setSetupCode('');
      await load();
    } catch (err) {
      setSetupError(err instanceof ApiError ? err.message : 'Invalid verification code');
    } finally {
      setSetupSubmitting(false);
    }
  }

  // Panic mode (brief §5, "mode panique"): immediately invalidates every
  // session for this account, current browser included -- so once the API
  // call succeeds there is nothing left to sign this browser out *of*
  // except its own locally stored token, which logout() clears.
  async function handlePanic() {
    setPanicSubmitting(true);
    setPanicError(null);
    try {
      await api.post('/auth/panic');
      await logout();
    } catch (err) {
      setPanicError(err instanceof ApiError ? err.message : 'Unable to trigger panic mode');
      setPanicSubmitting(false);
    }
  }

  async function handleDisable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setDisableSubmitting(true);
    setDisableError(null);
    try {
      await api.post('/auth/2fa/disable', { code: disableCode.trim() });
      setShowDisableForm(false);
      setDisableCode('');
      setRecoveryCodes(null);
      await load();
    } catch (err) {
      setDisableError(err instanceof ApiError ? err.message : 'Invalid verification code');
    } finally {
      setDisableSubmitting(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Security</h1>
          <Link to="/cases" className="back-link">
            &larr; My cases
          </Link>
        </div>
        <div className="page-header-actions">
          <Link to="/search" className="btn-secondary">Search</Link>
          <Link to="/graph" className="btn-secondary">Graph</Link>
          <Link to="/map" className="btn-secondary">Map</Link>
          <Link to="/calendar" className="btn-secondary">Calendar</Link>
          <Link to="/portfolio" className="btn-secondary">Portfolio</Link>
          <NotificationsBell />
          <span className="current-user">{user?.fullName}</span>
          <button onClick={logout} className="btn-secondary">Sign out</button>
        </div>
      </header>

      <p className="portfolio-hint">
        Two-factor authentication (brief §5.2) is required to access highly sensitive cases. Once
        enabled, you'll be asked for a fresh code whenever that step-up expires (by default, every
        12 hours).
      </p>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p>Loading...</p>
      ) : status?.enabled ? (
        <div className="security-card">
          <p className="security-status security-status-enabled">Two-factor authentication is enabled.</p>
          {!showDisableForm ? (
            <button className="btn-secondary" onClick={() => setShowDisableForm(true)}>
              Disable two-factor authentication
            </button>
          ) : (
            <form className="inline-form" onSubmit={handleDisable}>
              <input
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                placeholder="6-digit code or recovery code"
                autoFocus
                required
              />
              <button type="submit" className="btn-primary" disabled={disableSubmitting}>
                {disableSubmitting ? 'Disabling...' : 'Confirm disable'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowDisableForm(false)}>
                Cancel
              </button>
            </form>
          )}
          {disableError && <p className="form-error">{disableError}</p>}
        </div>
      ) : recoveryCodes ? (
        <div className="security-card">
          <p className="security-status security-status-enabled">Two-factor authentication is now enabled.</p>
          <p className="form-error">
            Save these recovery codes now -- each can be used once if you lose access to your
            authenticator app, and they will not be shown again.
          </p>
          <ul className="recovery-codes-list">
            {recoveryCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="security-card">
          <p className="security-status">Two-factor authentication is not enabled on your account.</p>
          {!setupData ? (
            <button className="btn-primary" onClick={handleStartSetup}>
              Set up two-factor authentication
            </button>
          ) : (
            <div className="totp-setup">
              <p>Scan this QR code with your authenticator app (Google Authenticator, Authy, ...):</p>
              <img src={setupData.qrCodeDataUrl} alt="2FA QR code" className="totp-qr" />
              <p className="totp-manual-secret">
                Or enter this key manually: <code>{setupData.secret}</code>
              </p>
              <form className="inline-form" onSubmit={handleConfirmSetup}>
                <input
                  value={setupCode}
                  onChange={(e) => setSetupCode(e.target.value)}
                  placeholder="6-digit code from your app"
                  autoFocus
                  required
                />
                <button type="submit" className="btn-primary" disabled={setupSubmitting}>
                  {setupSubmitting ? 'Verifying...' : 'Confirm'}
                </button>
              </form>
              {setupError && <p className="form-error">{setupError}</p>}
            </div>
          )}
        </div>
      )}

      <div className="page-toolbar">
        <h2>Panic mode</h2>
      </div>
      <p className="portfolio-hint">
        Immediately signs this account out of every device and browser at once (brief
        §5) -- use this if a device might be compromised or seized. This does not hide or
        delete any data; it only forces every session, including this one, to sign in again.
      </p>
      <div className="security-card security-card-danger">
        {!showPanicConfirm ? (
          <button className="btn-danger-small" onClick={() => setShowPanicConfirm(true)}>
            Panic -- sign out everywhere
          </button>
        ) : (
          <div className="panic-confirm">
            <p className="form-error">
              This will sign out every device using this account, including this one. Continue?
            </p>
            <button className="btn-danger-small" onClick={handlePanic} disabled={panicSubmitting}>
              {panicSubmitting ? 'Signing out everywhere...' : 'Yes, sign out everywhere'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowPanicConfirm(false)}
              disabled={panicSubmitting}
            >
              Cancel
            </button>
          </div>
        )}
        {panicError && <p className="form-error">{panicError}</p>}
      </div>
    </div>
  );
}

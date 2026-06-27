import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { ROUTES } from '@/config/routes.config';
import { Lock, ArrowLeft, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { getFriendlyErrorMessage, logErrorToDb } from '@/lib/error-helpers';

export function ResetPassword() {
  const { updatePassword, user, logout } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  // Holds the timeout ID so we can cancel it when the session arrives early.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against double-execution in React Strict Mode.
  const exchangeAttempted = useRef(false);

  // When AuthProvider receives PASSWORD_RECOVERY and sets user,
  // mark session as ready and cancel the expiry timeout.
  useEffect(() => {
    if (user) {
      setSessionReady(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  }, [user]);

  // admin.generateLink({ type: 'recovery' }) redirects with #access_token=
  // (implicit flow). With flowType: 'pkce', the Supabase browser client
  // intentionally ignores hash tokens, so we manually parse and exchange them.
  useEffect(() => {
    // Strict Mode guard — only attempt the exchange once per mount lifecycle.
    if (exchangeAttempted.current) return;

    const hash = window.location.hash;
    if (!hash || !hash.includes('access_token') || !hash.includes('type=recovery')) return;

    exchangeAttempted.current = true;

    const params = new URLSearchParams(hash.substring(1)); // strip the '#'
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    // Security: wipe the token from the URL immediately so it doesn't linger
    // in browser history or get read by third-party scripts.
    window.history.replaceState({}, '', window.location.pathname);

    if (accessToken && refreshToken) {
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error: sessionError }) => {
          if (sessionError) {
            console.error('[ResetPassword] setSession error:', sessionError);
            setTimedOut(true);
          }
          // onAuthStateChange fires PASSWORD_RECOVERY → AuthProvider sets user
          // → useEffect([user]) above sets sessionReady = true
        });
    } else {
      // Hash present but malformed — fail immediately rather than waiting.
      setTimedOut(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Give Supabase up to 5 seconds to exchange the token.
  // Stored in a ref so the user effect can cancel it early.
  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      setTimedOut(true);
    }, 5000);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!password.trim()) {
        throw new Error('Password cannot be empty.');
      }
      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters.');
      }
      if (password !== confirmPassword) {
        throw new Error('Passwords do not match.');
      }

      await updatePassword(password);
      setSuccess(true);

      // Auto-logout the temporary recovery session so they sign in cleanly with the new credentials
      try {
        await logout();
      } catch (logoutErr) {
        console.warn('Silent logout failed', logoutErr);
      }

    } catch (err: unknown) {
      console.error(err);
      setError(getFriendlyErrorMessage(err, 'Failed to update password.'));
      void logErrorToDb(err, { context: 'ResetPassword.handleSubmit' });
    } finally {
      setLoading(false);
    }
  };

  if (!sessionReady && !timedOut) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 animate-fade-in">
        <div className="glass border border-border/40 p-8 rounded-2xl shadow-xl text-center space-y-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-sm text-muted-foreground">Verifying secure recovery session...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 animate-fade-in">
        <div className="glass border border-border/40 p-8 rounded-2xl shadow-xl text-center space-y-6">
          <div className="inline-flex w-12 h-12 rounded-xl bg-green-500/10 items-center justify-center text-green-500 shadow-md">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black font-heading tracking-tight">
              Password updated successfully!
            </h1>
            <p className="text-sm text-muted-foreground">
              Your password has been changed. You can now log in with your new password.
            </p>
          </div>
          <button
            onClick={() => navigate(ROUTES.LOGIN)}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20 hover:opacity-90 transition-all cursor-pointer"
          >
            Go to Sign In
          </button>
        </div>
      </div>
    );
  }

  // If timed out and no session was established
  if (!sessionReady && timedOut) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 animate-fade-in">
        <div className="glass border border-border/40 p-8 rounded-2xl shadow-xl text-center space-y-6">
          <div className="inline-flex w-12 h-12 rounded-xl bg-destructive/10 items-center justify-center text-destructive shadow-md">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black font-heading tracking-tight">
              Invalid Session
            </h1>
            <p className="text-sm text-muted-foreground">
              Your password reset link is invalid or has expired. Please request a new one.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => navigate(ROUTES.FORGOT_PASSWORD)}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20 hover:opacity-90 transition-all cursor-pointer"
            >
              Request New Link
            </button>
            <button
              onClick={() => navigate(ROUTES.LOGIN)}
              className="w-full py-2.5 rounded-xl border border-border bg-input hover:bg-border/20 text-foreground font-semibold transition-all cursor-pointer"
            >
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-12 px-4 animate-fade-in">
      <div className="text-center space-y-2 mb-8">
        <div className="inline-flex w-12 h-12 rounded-xl bg-gradient-to-tr from-primary to-accent items-center justify-center text-white shadow-md mb-2">
          <Lock className="w-6 h-6 animate-pulse" />
        </div>
        <h1 className="text-3xl font-black font-heading tracking-tight">
          Set new password
        </h1>
        <p className="text-sm text-muted-foreground">
          Please enter and confirm your new password below.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-xl bg-destructive/10 text-destructive text-sm border border-destructive/20 text-center">
          {error}
        </div>
      )}

      <div className="glass border border-border/40 p-6 rounded-2xl shadow-xl space-y-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* New Password */}
          <div className="space-y-1.5">
            <label className="text-2sm font-semibold tracking-wide" htmlFor="password">
              New Password
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-3 text-muted-foreground">
                <Lock className="w-4.5 h-4.5" />
              </span>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              />
            </div>
          </div>

          {/* Confirm New Password */}
          <div className="space-y-1.5">
            <label className="text-2sm font-semibold tracking-wide" htmlFor="confirmPassword">
              Confirm New Password
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-3 text-muted-foreground">
                <Lock className="w-4.5 h-4.5" />
              </span>
              <input
                id="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              />
            </div>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 mt-2 rounded-xl bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20 hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer"
          >
            {loading ? 'Updating Password...' : 'Reset Password'}
          </button>
        </form>

        <div className="text-center pt-2">
          <button
            onClick={() => navigate(ROUTES.LOGIN)}
            className="inline-flex items-center gap-1 text-2sm font-semibold text-primary hover:underline cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Sign In
          </button>
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;

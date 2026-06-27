import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/config/routes.config';
import { Mail, ArrowLeft, KeyRound } from 'lucide-react';
import { getFriendlyErrorMessage, logErrorToDb } from '@/lib/error-helpers';

export function ForgotPassword() {
  const { sendPasswordResetEmail } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      if (!email.trim()) {
        throw new Error('Email address is required.');
      }
      await sendPasswordResetEmail(email.trim());
      setSuccessMsg('Check your email for instructions to reset your password!');
      setEmail('');
    } catch (err: unknown) {
      console.error(err);
      setError(getFriendlyErrorMessage(err, 'Failed to request password reset.'));
      void logErrorToDb(err, { context: 'ForgotPassword.handleSubmit', email });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-12 px-4 animate-fade-in">
      <div className="text-center space-y-2 mb-8">
        <div className="inline-flex w-12 h-12 rounded-xl bg-gradient-to-tr from-primary to-accent items-center justify-center text-white shadow-md mb-2">
          <KeyRound className="w-6 h-6 animate-pulse" />
        </div>
        <h1 className="text-3xl font-black font-heading tracking-tight">
          Forgot your password?
        </h1>
        <p className="text-sm text-muted-foreground">
          Enter your email address and we'll send you a link to reset your password.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-xl bg-destructive/10 text-destructive text-sm border border-destructive/20 text-center">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-4 rounded-xl bg-green-500/10 text-green-600 dark:text-green-400 text-sm border border-green-500/20 text-center">
          {successMsg}
        </div>
      )}

      <div className="glass border border-border/40 p-6 rounded-2xl shadow-xl space-y-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-2sm font-semibold tracking-wide" htmlFor="email">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-3 text-muted-foreground">
                <Mail className="w-4.5 h-4.5" />
              </span>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.name@domain.com"
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
            {loading ? 'Sending Request...' : 'Send Reset Link'}
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

export default ForgotPassword;

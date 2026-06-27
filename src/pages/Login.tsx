import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/config/routes.config';
import { Lock, Mail, User as UserIcon, Sparkles } from 'lucide-react';
import { getFriendlyErrorMessage, logErrorToDb } from '@/lib/error-helpers';

export function Login() {
  const {
    login,
    register,
    signInWithGoogle,
    signInWithMicrosoft,
    signInWithMagicLink,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [isSignUp, setIsSignUp] = useState(false);
  const [isMagicLink, setIsMagicLink] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');


  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      console.error(err);
      setError(getFriendlyErrorMessage(err, 'Google sign-in failed.'));
      void logErrorToDb(err, { context: 'Login.handleGoogleSignIn' });
      setLoading(false);
    }
  };

  const handleMicrosoftSignIn = async () => {
    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      await signInWithMicrosoft();
    } catch (err: unknown) {
      console.error(err);
      setError(getFriendlyErrorMessage(err, 'Microsoft sign-in failed.'));
      void logErrorToDb(err, { context: 'Login.handleMicrosoftSignIn' });
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);
 
    try {
      if (isSignUp) {
        if (!formData.name.trim()) {
          throw new Error('Name is required.');
        }
        await register(formData.email, formData.password, formData.name);
        setSuccessMsg('Sign up successful! You can now log in.');
        setIsSignUp(false);
      } else if (isMagicLink) {
        await signInWithMagicLink(formData.email);
        setSuccessMsg('Check your email for the magic sign-in link!');
      } else {
        await login(formData.email, formData.password);
        const state = location.state as { from?: string } | null;
        navigate(state?.from || ROUTES.DASHBOARD);
      }
    } catch (err: unknown) {
      console.error(err);
      setError(getFriendlyErrorMessage(err, 'Authentication failed. Please verify credentials.'));
      void logErrorToDb(err, { context: 'Login.handleSubmit', isSignUp, isMagicLink });
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="max-w-md mx-auto py-12 px-4 animate-fade-in">
      <div className="text-center space-y-2 mb-8">
        <div className="inline-flex w-12 h-12 rounded-xl bg-gradient-to-tr from-primary to-accent items-center justify-center text-white shadow-md mb-2">
          <Sparkles className="w-6 h-6 animate-pulse" />
        </div>
        <h1 className="text-3xl font-black font-heading tracking-tight">
          {isSignUp ? 'Create your free VeriDraw account.' : 'Welcome to VeriDraw'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isSignUp ? 'Host live drawing events, invite spectators, and manage your draw history.' : 'Sign in to access your drawing dashboard.'}
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
          {/* Name (Sign Up only) */}
          {isSignUp && (
            <div className="space-y-1.5">
              <label className="text-2sm font-semibold tracking-wide" htmlFor="name">
                Full Name
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-3 text-muted-foreground">
                  <UserIcon className="w-4.5 h-4.5" />
                </span>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g. John Doe"
                  className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                />
              </div>
            </div>
          )}

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
                name="email"
                type="email"
                required
                value={formData.email}
                onChange={handleChange}
                placeholder="your.name@domain.com"
                className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              />
            </div>
          </div>

          {(isSignUp || !isMagicLink) && (
            <div className="space-y-1.5">
              <label className="text-2sm font-semibold tracking-wide" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-3 text-muted-foreground">
                  <Lock className="w-4.5 h-4.5" />
                </span>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                />
              </div>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 mt-2 rounded-xl bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20 hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer"
          >
            {loading ? 'Authenticating...' : isSignUp ? 'Create Account' : isMagicLink ? 'Send Magic Link' : 'Sign In'}
          </button>

          {/* Magic Link toggle */}
          {!isSignUp && (
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsMagicLink((prev) => !prev);
                  setError('');
                  setSuccessMsg('');
                }}
                className="text-2xs font-semibold text-primary hover:underline cursor-pointer"
              >
                {isMagicLink ? 'Sign in with email and password' : 'Sign in with a passwordless Magic Link'}
              </button>
            </div>
          )}
        </form>

        <div className="relative flex py-2 items-center text-2xs uppercase text-muted-foreground">
          <div className="flex-grow border-t border-border/30"></div>
          <span className="flex-shrink mx-3">Or continue with</span>
          <div className="flex-grow border-t border-border/30"></div>
        </div>

        {/* Social Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl border border-border bg-input hover:bg-border/20 text-2sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <span className="font-bold text-red-500">G</span> Google
          </button>
          <button
            onClick={handleMicrosoftSignIn}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl border border-border bg-input hover:bg-border/20 text-2sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <span className="font-bold text-blue-500">M</span> Microsoft
          </button>
        </div>

        {/* Toggle link */}
        <p className="text-2sm text-center text-muted-foreground">
          {isSignUp ? (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(false);
                  setIsMagicLink(false);
                  setError('');
                  setSuccessMsg('');
                }}
                className="font-semibold text-primary hover:underline cursor-pointer"
              >
                Sign In
              </button>
            </>
          ) : (
            <>
              Don't have an account? It's free to{' '}
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(true);
                  setIsMagicLink(false);
                  setError('');
                  setSuccessMsg('');
                }}
                className="font-semibold text-primary hover:underline cursor-pointer"
              >
                create one
              </button>
              .
            </>
          )}
        </p>
      </div>
    </div>
  );
}
export default Login;

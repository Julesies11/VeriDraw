import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/config/routes.config';
import { Lock, Mail, User as UserIcon } from 'lucide-react';
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
    confirmPassword: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = (full = false) => {
    setFormData((prev) => ({
      name: full ? '' : prev.name,
      email: full ? '' : prev.email,
      password: '',
      confirmPassword: '',
    }));
    setError('');
    setSuccessMsg('');
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
        const trimmedName = formData.name.trim();
        const trimmedEmail = formData.email.trim();
        const password = formData.password;
        const confirmPassword = formData.confirmPassword;

        if (!trimmedName) {
          throw new Error('Full Name is required.');
        }

        // Basic email format check
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(trimmedEmail)) {
          throw new Error('Please enter a valid email address.');
        }

        // Password length check
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters long.');
        }

        // Password confirmation matching check
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }

        await register(trimmedEmail, password, trimmedName);
        setSuccessMsg('Sign up successful! Please check your email for a confirmation link to verify your account before logging in.');
        resetForm(true);
        setIsSignUp(false);
      } else if (isMagicLink) {
        await signInWithMagicLink(formData.email);
        setSuccessMsg('Check your email for the magic sign-in link!');
      } else {
        await login(formData.email.trim(), formData.password);
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
        <img
          src="/web-app-manifest-192x192.png"
          alt="VeriDraw Logo"
          className="w-20 h-20 rounded-2xl mx-auto mb-2 object-cover"
        />
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
        <div className="mb-4 p-4 rounded-xl bg-green-500/10 text-green-600 text-sm border border-green-500/20 text-center">
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
                  autoComplete="name"
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
                autoComplete="email"
                placeholder="your.name@domain.com"
                className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              />
            </div>
          </div>

          {(isSignUp || !isMagicLink) && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-2sm font-semibold tracking-wide" htmlFor="password">
                    Password
                  </label>
                  {!isSignUp && (
                    <button
                      type="button"
                      onClick={() => navigate(ROUTES.FORGOT_PASSWORD)}
                      className="text-2xs font-semibold text-primary hover:underline cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  )}
                </div>
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
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    placeholder="••••••••"
                    className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                  />
                </div>
              </div>

              {isSignUp && (
                <div className="space-y-1.5">
                  <label className="text-2sm font-semibold tracking-wide" htmlFor="confirmPassword">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3 text-muted-foreground">
                      <Lock className="w-4.5 h-4.5" />
                    </span>
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      required
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      autoComplete="new-password"
                      placeholder="••••••••"
                      className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                    />
                  </div>
                </div>
              )}
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
                  resetForm(false);
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
                  resetForm(true);
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
                  resetForm(true);
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

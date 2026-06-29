import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { AuthContext } from '../context/auth-context';

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const authInitialized = useRef(false);
  const isExchangingHash = useRef(false);

  const handleAuthStateChange = useCallback(
    (event: string, session: Session | null) => {
      if (import.meta.env.DEV) console.log(`[Auth] Event: ${event}`);

      // If we are currently exchanging an implicit hash session, ignore
      // other intermediate/fallback events until the login completes.
      if (isExchangingHash.current && event !== 'SIGNED_IN' && event !== 'TOKEN_REFRESHED' && event !== 'USER_UPDATED') {
        return;
      }

      if (session?.user) {
        setUser(session.user);
      } else {
        setUser(null);
      }
      setLoading(false);
    },
    []
  );

  // Handle implicit flow hash tokens (magic link, signup, invite)
  // because when flowType is set to 'pkce', the browser client ignores hashes by default.
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    if (!hash || !hash.includes('access_token')) return;

    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');

    // Skip password recovery hashes here as they are specifically handled by ResetPassword.tsx
    if (accessToken && refreshToken && type !== 'recovery') {
      isExchangingHash.current = true;

      // Clear the hash from the URL immediately for security and clean URLs
      window.history.replaceState({}, '', window.location.pathname + window.location.search);

      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => {
          isExchangingHash.current = false;
          if (error) {
            console.error('[Auth] Error setting session from hash:', error);
            setLoading(false);
          } else {
            console.log(`[Auth] Session successfully established via ${type || 'implicit'} hash`);
          }
        })
        .catch((err) => {
          isExchangingHash.current = false;
          console.error('[Auth] Unexpected error setting session from hash:', err);
          setLoading(false);
        });
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    // 1. Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (isMounted) {
        authInitialized.current = true;
        handleAuthStateChange(event, session);
      }
    });

    // 2. Quiet Fallback: Check session manually if listener doesn't fire in 200ms
    const fallbackTimeout = setTimeout(() => {
      if (isMounted && !authInitialized.current) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (isMounted && !authInitialized.current) {
            console.log('[Auth] Fallback session check triggered');
            authInitialized.current = true;
            handleAuthStateChange('INITIAL_SESSION', session);
          }
        });
      }
    }, 200);

    // 3. Safety Timeout: Ensure loading resolves within 8 seconds
    const safetyTimeout = setTimeout(() => {
      if (isMounted && !authInitialized.current) {
        console.warn('[Auth] Safety timeout reached');
        setLoading(false);
      }
    }, 8000);

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      clearTimeout(fallbackTimeout);
      clearTimeout(safetyTimeout);
    };
  }, [handleAuthStateChange]);

  const login = async (email: string, password: string) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setLoading(false);
      throw error;
    }
  };

  const register = async (email: string, password: string, name: string) => {
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: name,
        },
      },
    });
    if (error) {
      setLoading(false);
      throw error;
    }
  };

  const logout = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    queryClient.clear();
    setUser(null);
    setLoading(false);
  };

  const signInWithGoogle = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}`,
      },
    });
    if (error) {
      setLoading(false);
      throw error;
    }
  };

  const signInWithMicrosoft = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${window.location.origin}`,
        scopes: 'openid email profile',
      },
    });
    if (error) {
      setLoading(false);
      throw error;
    }
  };

  const signInWithMagicLink = async (email: string) => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('vd-send-magic-link', {
      body: {
        email,
        redirectTo: `${window.location.origin}`,
      },
    });
    if (error || (data && data.error)) {
      setLoading(false);
      throw new Error(error?.message || data?.error || 'Failed to send magic link');
    }
    setLoading(false);
  };

  const sendPasswordResetEmail = async (email: string) => {
    // Always use the Edge Function so email is sent via Resend (not Supabase's
    // built-in mailer, which cannot be configured on this shared project).
    const { data, error } = await supabase.functions.invoke('vd-send-password-reset', {
      body: {
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      },
    });
    if (error || (data && data.error)) {
      throw new Error('Failed to send password reset email: ' + (error?.message || data?.error || 'Unknown error'));
    }
  };

  const updatePassword = async (password: string) => {
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setLoading(false);
      throw error;
    }
    setLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{
        loading,
        user,
        login,
        register,
        logout,
        signInWithGoogle,
        signInWithMicrosoft,
        signInWithMagicLink,
        sendPasswordResetEmail,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

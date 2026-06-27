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

  const handleAuthStateChange = useCallback(
    async (event: string, session: Session | null) => {
      console.log(`[Auth] Event: ${event}`);
      if (session?.user) {
        setUser(session.user);
      } else {
        setUser(null);
      }
      setLoading(false);
    },
    []
  );

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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

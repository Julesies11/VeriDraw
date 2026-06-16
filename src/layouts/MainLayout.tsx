import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/config/routes.config';
import { LogOut, Sparkles, User as UserIcon } from 'lucide-react';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme');
      if (stored === 'light' || stored === 'dark') return stored;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate(ROUTES.LOGIN);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col transition-colors duration-300">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full glass border-b border-border/40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to={ROUTES.DASHBOARD} className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-white shadow-md shadow-primary/20">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <span className="font-heading font-bold text-xl tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent group-hover:opacity-90 transition-opacity">
              VeriDraw
            </span>
          </Link>

          <nav className="flex items-center gap-4">

            {user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-secondary border border-border/20">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                    {user.email?.[0].toUpperCase() || <UserIcon className="w-3 h-3" />}
                  </div>
                  <span className="text-2sm font-medium hidden sm:inline text-secondary-foreground">
                    {user.user_metadata?.display_name || user.email?.split('@')[0]}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2.5 rounded-xl hover:bg-destructive/10 border border-border/40 text-muted-foreground hover:text-destructive transition-all cursor-pointer"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link
                to={ROUTES.LOGIN}
                className="px-4 py-2 text-2sm font-medium rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20 hover:opacity-90 transition-all"
              >
                Sign In
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-border/40 text-center text-2xs text-muted-foreground">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-center">
          <p>© 2026 VeriDraw</p>
        </div>
      </footer>
    </div>
  );
}

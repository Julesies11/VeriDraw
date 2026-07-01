import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { ROUTES } from '@/config/routes.config';
import { LogOut, User as UserIcon } from 'lucide-react';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { user, logout } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const location = useLocation();
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAvatarError(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [profile?.avatar_url]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('dark');
    localStorage.removeItem('theme');
  }, []);

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to={ROUTES.DASHBOARD} className="flex items-center gap-2 group">
            <img
              src="/web-app-manifest-192x192.png"
              alt="VeriDraw Logo"
              className="w-11 h-11 rounded-xl object-cover group-hover:scale-105 transition-transform"
            />
            <span className="font-heading font-bold text-xl tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent group-hover:opacity-90 transition-opacity">
              VeriDraw
            </span>
          </Link>

          <nav className="flex items-center gap-4">

            {user ? (
              <div className="flex items-center gap-3">
                <Link
                  to={ROUTES.PROFILE}
                  state={{ from: location.pathname }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 border border-border/20 transition-all cursor-pointer group/user"
                >
                  <div className="w-6 h-6 rounded-full overflow-hidden bg-primary/20 flex items-center justify-center text-primary text-xs font-bold border border-border/10 relative">
                    {profile?.avatar_url && !avatarError ? (
                      <img
                        src={profile.avatar_url}
                        alt="Profile Avatar"
                        className="w-full h-full object-cover"
                        onError={() => setAvatarError(true)}
                      />
                    ) : (
                      <span className="group-hover/user:scale-105 transition-transform absolute inset-0 flex items-center justify-center">
                        {profile?.display_name?.[0].toUpperCase() || user.email?.[0].toUpperCase() || <UserIcon className="w-3 h-3" />}
                      </span>
                    )}
                  </div>
                  <span className="text-2sm font-medium hidden sm:inline text-secondary-foreground group-hover/user:text-primary transition-colors">
                    {profile?.display_name || user.email?.split('@')[0]}
                  </span>
                </Link>
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
      <main id="main-content" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 scroll-mt-16">
        {children}
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-border/40 text-center text-2xs text-muted-foreground">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-center">
          <p>© 2026 VeriDraw</p>
        </div>
      </footer>
    </div>
  );
}

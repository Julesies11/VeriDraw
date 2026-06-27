import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router';
import { QueryProvider } from '@/providers/QueryProvider';
import { AuthProvider } from '@/auth/providers/supabase-provider';
import { MainLayout } from '@/layouts/MainLayout';
import { Dashboard } from '@/pages/Dashboard';
import { CreateEvent } from '@/pages/CreateEvent';
import { DrawRoom } from '@/pages/DrawRoom';
import { QuickDraw } from '@/pages/QuickDraw';
import { Login } from '@/pages/Login';
import { ForgotPassword } from '@/pages/ForgotPassword';
import { ResetPassword } from '@/pages/ResetPassword';
import { Profile } from '@/pages/Profile';
import { VerifyDraw } from '@/pages/VerifyDraw';
import { ROUTES } from '@/config/routes.config';

// Vanity /join/:code route redirecting to /draw/:code
function JoinRedirect() {
  const { code } = useParams();
  return <Navigate to={`/draw/${code}`} replace />;
}

export function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <BrowserRouter>
          <MainLayout>
            <Routes>
              {/* Core Dashboard */}
              <Route path={ROUTES.DASHBOARD} element={<Dashboard />} />

              {/* Quick Draw */}
              <Route path={ROUTES.QUICK_DRAW} element={<QuickDraw />} />

              {/* Login Room */}
              <Route path={ROUTES.LOGIN} element={<Login />} />

              {/* Forgot / Reset password */}
              <Route path={ROUTES.FORGOT_PASSWORD} element={<ForgotPassword />} />
              <Route path={ROUTES.RESET_PASSWORD} element={<ResetPassword />} />

              {/* Profile Settings */}
              <Route path={ROUTES.PROFILE} element={<Profile />} />

              {/* Verify Draw */}
              <Route path={ROUTES.VERIFY} element={<VerifyDraw />} />
              <Route path={ROUTES.VERIFY_ROOM_PATTERN} element={<VerifyDraw />} />

              {/* Create Drawing event */}
              <Route path={ROUTES.CREATE_EVENT} element={<CreateEvent />} />

              {/* Live drawing room */}
              <Route path={ROUTES.DRAW_ROOM_PATTERN} element={<DrawRoom />} />

              {/* Vanity join redirect */}
              <Route path="/join/:code" element={<JoinRedirect />} />

              {/* Redirect fallback */}
              <Route path="*" element={<Navigate to={ROUTES.DASHBOARD} replace />} />
            </Routes>
          </MainLayout>
        </BrowserRouter>
      </AuthProvider>
    </QueryProvider>
  );
}

export default App;

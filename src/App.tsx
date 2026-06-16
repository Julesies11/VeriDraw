import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryProvider } from '@/providers/QueryProvider';
import { AuthProvider } from '@/auth/providers/supabase-provider';
import { MainLayout } from '@/layouts/MainLayout';
import { Dashboard } from '@/pages/Dashboard';
import { CreateEvent } from '@/pages/CreateEvent';
import { DrawRoom } from '@/pages/DrawRoom';
import { QuickDraw } from '@/pages/QuickDraw';
import { Login } from '@/pages/Login';
import { ROUTES } from '@/config/routes.config';

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

              {/* Create Drawing event */}
              <Route path={ROUTES.CREATE_EVENT} element={<CreateEvent />} />

              {/* Live drawing room */}
              <Route path={ROUTES.DRAW_ROOM_PATTERN} element={<DrawRoom />} />

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

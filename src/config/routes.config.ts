/**
 * Centralized navigation routes for VeriDraw.
 */
export const ROUTES = {
  DASHBOARD: '/',
  CREATE_EVENT: '/create',
  QUICK_DRAW: '/quick-draw',
  DRAW_ROOM: (slugOrId: string) => `/draw/${slugOrId}`,
  DRAW_ROOM_PATTERN: '/draw/:slugOrId',
  REPLAY_ROOM: (slugOrId: string) => `/replay/${slugOrId}`,
  REPLAY_ROOM_PATTERN: '/replay/:slugOrId',
  LOGIN: '/login',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  PROFILE: '/profile',
  VERIFY: '/verify',
  VERIFY_ROOM: (slugOrId: string) => `/verify/${slugOrId}`,
  VERIFY_ROOM_PATTERN: '/verify/:slugOrId',
} as const;

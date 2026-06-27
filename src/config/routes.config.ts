/**
 * Centralized navigation routes for VeriDraw.
 */
export const ROUTES = {
  DASHBOARD: '/',
  CREATE_EVENT: '/create',
  QUICK_DRAW: '/quick-draw',
  DRAW_ROOM: (slugOrId: string) => `/draw/${slugOrId}`,
  DRAW_ROOM_PATTERN: '/draw/:slugOrId',
  LOGIN: '/login',
  PROFILE: '/profile',
  VERIFY: '/verify',
  VERIFY_ROOM: (slugOrId: string) => `/verify/${slugOrId}`,
  VERIFY_ROOM_PATTERN: '/verify/:slugOrId',
} as const;

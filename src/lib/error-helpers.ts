/**
 * Maps cryptic API/auth errors to clean, user-friendly messages.
 * Prevents internal configuration names/paths (like Supabase) from leaking to production users.
 */
export const getFriendlyErrorMessage = (err: unknown, defaultMsg: string): string => {
  if (!err) return defaultMsg;
  const msg = typeof err === 'string'
    ? err
    : (err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : '');

  if (msg.includes('provider is not enabled') || msg.includes('Unsupported provider')) {
    if (import.meta.env.DEV) {
      return 'This login provider is not enabled in your Supabase dashboard. Please enable it under Authentication > Providers in the Supabase console.';
    }
    return 'This login provider is currently unavailable. Please sign in with email/password or contact support.';
  }
  return msg || defaultMsg;
};

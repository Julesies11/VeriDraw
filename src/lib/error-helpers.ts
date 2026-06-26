import { supabase } from '@/lib/supabase';
import { TABLES } from '@/config/db-tables';

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

/**
 * Logs errors directly to the database in public.vd_error_logs for audit tracking.
 */
export const logErrorToDb = async (
  err: unknown,
  context: Record<string, unknown> = {}
): Promise<void> => {
  try {
    const errorMessage = err instanceof Error ? err.message : String(err || 'Unknown error');
    const errorStack = err instanceof Error ? err.stack : undefined;

    const { data: { user } } = await supabase.auth.getUser();
    const userId = user ? user.id : null;

    const { error } = await supabase
      .from(TABLES.ERROR_LOGS)
      .insert({
        error_message: errorMessage,
        error_stack: errorStack,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        context: context as any,
        user_id: userId,
      });

    if (error) {
      console.error('[logErrorToDb] Failed to write log to DB:', error);
    }
  } catch (logErr) {
    console.error('[logErrorToDb] Logger function crashed:', logErr);
  }
};


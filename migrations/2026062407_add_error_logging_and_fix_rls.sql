-- migrations/2026062407_add_error_logging_and_fix_rls.sql
-- Sets up the error logging table with RLS.

-- 1. Create error logs table
CREATE TABLE IF NOT EXISTS public.vd_error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_message TEXT NOT NULL,
    error_stack TEXT,
    context JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.vd_error_logs ENABLE ROW LEVEL SECURITY;

-- 3. Create INSERT policy for all roles (anon/authenticated) to register logs
DROP POLICY IF EXISTS insert_vd_error_logs ON public.vd_error_logs;
CREATE POLICY insert_vd_error_logs ON public.vd_error_logs
    FOR INSERT TO authenticated, anon WITH CHECK (true);

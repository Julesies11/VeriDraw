-- migrations/2026062400_auto_draw_scheduler.sql
-- Sets up the database-side cron jobs and HTTP triggers to auto-start scheduled events.

-- 1. Enable required Supabase extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net; -- installs pg_net in its default schema (usually 'net')

-- 2. Create the VeriDraw Settings table
CREATE TABLE IF NOT EXISTS public.vd_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Row Level Security for settings
ALTER TABLE public.vd_settings ENABLE ROW LEVEL SECURITY;

-- Lock down all read/write operations to superuser/system context. Since it contains
-- secrets like cron_secret, we do not define any public SELECT RLS policies.

-- Allow authenticated hosts (creators) or admins to manage settings (or just keep it superuser/migration managed)
-- Since it contains secrets like CRON_SECRET, we restrict INSERT/UPDATE/DELETE to superusers/migrations only.

-- Trigger to auto-update updated_at timestamp
CREATE TRIGGER trigger_vd_settings_updated_at
    BEFORE UPDATE ON public.vd_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.vd_set_updated_at();

-- Insert default configurations (users can change base_url to public url if needed)
INSERT INTO public.vd_settings (key, value)
VALUES 
    ('edge_function_base_url', 'http://kong:8000'), -- 'http://kong:8000' is the internal docker URL inside Supabase local dev
    ('cron_secret', 'vd-cron-secret-token-389f4b')
ON CONFLICT (key) DO NOTHING;

-- 3. Create the function to check and activate scheduled draws
CREATE OR REPLACE FUNCTION public.vd_check_and_activate_scheduled_draws()
RETURNS void AS $$
DECLARE
    r RECORD;
    base_url TEXT;
    cron_secret TEXT;
    full_url TEXT;
BEGIN
    -- Fetch Edge Function configurations
    SELECT value INTO base_url FROM public.vd_settings WHERE key = 'edge_function_base_url';
    SELECT value INTO cron_secret FROM public.vd_settings WHERE key = 'cron_secret';

    -- Fallbacks
    IF base_url IS NULL THEN
        base_url := 'http://kong:8000';
    END IF;
    IF cron_secret IS NULL THEN
        cron_secret := 'vd-cron-secret-token-389f4b';
    END IF;

    full_url := base_url || '/functions/v1/vd-run-auto-draw';

    -- A. Activate events that reached their scheduled start time
    FOR r IN 
        SELECT id FROM public.vd_events 
        WHERE status = 'scheduled' AND scheduled_start_time <= now()
    LOOP
        -- Transition status to active
        UPDATE public.vd_events 
        SET status = 'active', updated_at = now()
        WHERE id = r.id;

        -- Asynchronously trigger the Deno Edge Function loop
        PERFORM net.http_post(
            url := full_url,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'x-veridraw-cron-secret', cron_secret
            ),
            body := jsonb_build_object('event_id', r.id)
        );
    END LOOP;

    -- B. Recover "stuck" active sessions
    -- If event is active but the session hasn't been updated for > 3 minutes,
    -- the orchestrator Edge Function might have died. Re-trigger it.
    FOR r IN 
        SELECT e.id FROM public.vd_events e
        JOIN public.vd_event_sessions s ON s.event_id = e.id
        WHERE e.status = 'active' AND s.updated_at < now() - INTERVAL '3 minutes'
    LOOP
        -- Asynchronously re-trigger the orchestrator
        PERFORM net.http_post(
            url := full_url,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'x-veridraw-cron-secret', cron_secret
            ),
            body := jsonb_build_object('event_id', r.id)
        );

        -- Bump updated_at in the database to prevent immediate double triggers on the next cron run
        UPDATE public.vd_event_sessions 
        SET updated_at = now()
        WHERE event_id = r.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

-- 4. Schedule the cron job using pg_cron
-- Remove the schedule if it exists first to allow clean migration reruns
SELECT cron.unschedule('vd-auto-draw-checker') FROM cron.job WHERE jobname = 'vd-auto-draw-checker';

-- Schedule check every minute
SELECT cron.schedule('vd-auto-draw-checker', '* * * * *', 'SELECT public.vd_check_and_activate_scheduled_draws()');

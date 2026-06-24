-- migrations/2026062402_add_anon_key_to_settings.sql
-- Inserts the public anon key into settings and updates the HTTP headers to satisfy the Supabase Kong gateway.

INSERT INTO public.vd_settings (key, value)
VALUES ('supabase_anon_key', 'sb_publishable_zLUSQl5cNJleWzZNa8rAlw_JvGbZYYG')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

CREATE OR REPLACE FUNCTION public.vd_check_and_activate_scheduled_draws()
RETURNS void AS $$
DECLARE
    r RECORD;
    base_url TEXT;
    cron_secret TEXT;
    anon_key TEXT;
    full_url TEXT;
BEGIN
    -- Fetch Edge Function configurations
    SELECT value INTO base_url FROM public.vd_settings WHERE key = 'edge_function_base_url';
    SELECT value INTO cron_secret FROM public.vd_settings WHERE key = 'cron_secret';
    SELECT value INTO anon_key FROM public.vd_settings WHERE key = 'supabase_anon_key';

    -- Fallbacks
    IF base_url IS NULL THEN
        base_url := 'http://kong:8000';
    END IF;
    IF cron_secret IS NULL THEN
        cron_secret := 'vd-cron-secret-token-389f4b';
    END IF;
    IF anon_key IS NULL THEN
        anon_key := '';
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
                'apikey', anon_key,
                'Authorization', 'Bearer ' || anon_key,
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
                'apikey', anon_key,
                'Authorization', 'Bearer ' || anon_key,
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

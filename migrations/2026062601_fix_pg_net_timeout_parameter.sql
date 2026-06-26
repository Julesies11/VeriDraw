-- migrations/2026062601_fix_pg_net_timeout_parameter.sql
-- Updates public.vd_check_and_activate_scheduled_draws() to correct the pg_net timeout parameter name.

CREATE OR REPLACE FUNCTION public.vd_check_and_activate_scheduled_draws()
RETURNS void AS $$
DECLARE
    r RECORD;
    base_url TEXT;
    cron_secret TEXT;
    anon_key TEXT;
    full_url TEXT;
BEGIN
    SELECT value INTO base_url FROM public.vd_settings WHERE key = 'edge_function_base_url';
    SELECT value INTO cron_secret FROM public.vd_settings WHERE key = 'cron_secret';
    SELECT value INTO anon_key FROM public.vd_settings WHERE key = 'supabase_anon_key';

    IF base_url IS NULL THEN base_url := 'http://kong:8000'; END IF;
    IF cron_secret IS NULL THEN cron_secret := 'vd-cron-secret-token-389f4b'; END IF;
    IF anon_key IS NULL THEN anon_key := ''; END IF;

    full_url := base_url || '/functions/v1/vd-run-auto-draw';

    -- A. Invoke Edge Function for scheduled events that reached their start time
    FOR r IN 
        SELECT id FROM public.vd_events 
        WHERE status = 'scheduled' AND scheduled_start_time <= now()
    LOOP
        BEGIN
            PERFORM net.http_post(
                url := full_url,
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'apikey', anon_key,
                    'Authorization', 'Bearer ' || anon_key,
                    'x-veridraw-cron-secret', cron_secret
                ),
                body := jsonb_build_object('event_id', r.id),
                timeout_milliseconds := 150000
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed to enqueue auto-draw Edge Function trigger: %', SQLERRM;
        END;
    END LOOP;

    -- B. Recover "stuck" active sessions (sessions that have been active and untouched for > 3 minutes)
    FOR r IN 
        SELECT e.id FROM public.vd_events e
        JOIN public.vd_event_sessions s ON s.event_id = e.id
        WHERE e.status = 'active' AND s.updated_at < now() - INTERVAL '3 minutes'
    LOOP
        BEGIN
            PERFORM net.http_post(
                url := full_url,
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'apikey', anon_key,
                    'Authorization', 'Bearer ' || anon_key,
                    'x-veridraw-cron-secret', cron_secret
                ),
                body := jsonb_build_object('event_id', r.id),
                timeout_milliseconds := 150000
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed to enqueue auto-draw recovery trigger: %', SQLERRM;
        END;

        -- Bump updated_at in the database to prevent immediate double triggers on the next cron run
        UPDATE public.vd_event_sessions 
        SET updated_at = now()
        WHERE event_id = r.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

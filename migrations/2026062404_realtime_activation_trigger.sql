-- migrations/2026062404_realtime_activation_trigger.sql
-- Enables instant activation triggers when scheduled events reach their start time.
-- Allows spectator clients to activate the event to avoid pg_cron minute-turn latency.

-- 1. Update RLS policies to allow anyone to update a scheduled event if start time has passed
DROP POLICY IF EXISTS update_vd_events ON public.vd_events;
CREATE POLICY update_vd_events ON public.vd_events
    FOR UPDATE TO authenticated, anon
    USING (
        (auth.uid() = created_by) OR 
        (status = 'scheduled' AND scheduled_start_time <= now())
    )
    WITH CHECK (true); -- checks are instead handled securely inside the BEFORE trigger using OLD/NEW references

-- 2. Create a BEFORE UPDATE security check trigger to prevent parameter tampering by spectators
CREATE OR REPLACE FUNCTION public.vd_events_security_check_fn()
RETURNS trigger AS $$
BEGIN
    -- If the user is NOT the owner/creator (and this is not an anonymous/guest event with null creator),
    -- enforce that they can ONLY transition status from 'scheduled' to 'active'. All other fields must remain identical.
    IF NOT (
        (OLD.created_by IS NOT NULL AND auth.uid() = OLD.created_by) OR
        (OLD.created_by IS NULL)
    ) THEN
        IF NEW.status <> 'active' OR 
           OLD.status <> 'scheduled' OR 
           NEW.id <> OLD.id OR
           NEW.event_name <> OLD.event_name OR
           NEW.scheduled_start_time <> OLD.scheduled_start_time OR
           NEW.item_type <> OLD.item_type OR
           NEW.select_count <> OLD.select_count OR
           NEW.created_by IS DISTINCT FROM OLD.created_by OR
           NEW.created_at <> OLD.created_at OR
           NEW.slug <> OLD.slug OR
           NEW.duplicated_from IS DISTINCT FROM OLD.duplicated_from 
        THEN
            RAISE EXCEPTION 'Forbidden: Spectators can only activate scheduled draws and cannot modify other configurations.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

-- Bind the security check trigger
DROP TRIGGER IF EXISTS trigger_vd_events_security_check ON public.vd_events;
CREATE TRIGGER trigger_vd_events_security_check
    BEFORE UPDATE ON public.vd_events
    FOR EACH ROW
    EXECUTE FUNCTION public.vd_events_security_check_fn();

-- 3. Create the AFTER UPDATE trigger function on vd_events to auto-start Edge Function draws
CREATE OR REPLACE FUNCTION public.vd_events_status_trigger_fn()
RETURNS trigger AS $$
DECLARE
    base_url TEXT;
    cron_secret TEXT;
    anon_key TEXT;
    full_url TEXT;
BEGIN
    -- Only trigger the Edge Function when status transitions from 'scheduled' to 'active'
    IF OLD.status = 'scheduled' AND NEW.status = 'active' THEN
        SELECT value INTO base_url FROM public.vd_settings WHERE key = 'edge_function_base_url';
        SELECT value INTO cron_secret FROM public.vd_settings WHERE key = 'cron_secret';
        SELECT value INTO anon_key FROM public.vd_settings WHERE key = 'supabase_anon_key';

        IF base_url IS NULL THEN base_url := 'http://kong:8000'; END IF;
        IF cron_secret IS NULL THEN cron_secret := 'vd-cron-secret-token-389f4b'; END IF;
        IF anon_key IS NULL THEN anon_key := ''; END IF;

        full_url := base_url || '/functions/v1/vd-run-auto-draw';

        -- Asynchronously trigger the Deno Edge Function loop (wrapped in exception block to prevent blocking database)
        BEGIN
            PERFORM net.http_post(
                url := full_url,
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'apikey', anon_key,
                    'Authorization', 'Bearer ' || anon_key,
                    'x-veridraw-cron-secret', cron_secret
                ),
                body := jsonb_build_object('event_id', NEW.id),
                timeout_milliseconds := 150000
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed to enqueue auto-draw Edge Function trigger: %', SQLERRM;
        END;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

-- Bind the status trigger
DROP TRIGGER IF EXISTS trigger_vd_events_status_change ON public.vd_events;
CREATE TRIGGER trigger_vd_events_status_change
    AFTER UPDATE ON public.vd_events
    FOR EACH ROW
    EXECUTE FUNCTION public.vd_events_status_trigger_fn();

-- 4. Update the checker function to only perform status updates and recovery
CREATE OR REPLACE FUNCTION public.vd_check_and_activate_scheduled_draws()
RETURNS void AS $$
DECLARE
    r RECORD;
    base_url TEXT;
    cron_secret TEXT;
    anon_key TEXT;
    full_url TEXT;
BEGIN
    -- A. Activate events that reached their scheduled start time (trigger runs automatically)
    UPDATE public.vd_events 
    SET status = 'active', updated_at = now()
    WHERE status = 'scheduled' AND scheduled_start_time <= now();

    -- B. Recover "stuck" active sessions
    SELECT value INTO base_url FROM public.vd_settings WHERE key = 'edge_function_base_url';
    SELECT value INTO cron_secret FROM public.vd_settings WHERE key = 'cron_secret';
    SELECT value INTO anon_key FROM public.vd_settings WHERE key = 'supabase_anon_key';

    IF base_url IS NULL THEN base_url := 'http://kong:8000'; END IF;
    IF cron_secret IS NULL THEN cron_secret := 'vd-cron-secret-token-389f4b'; END IF;
    IF anon_key IS NULL THEN anon_key := ''; END IF;

    full_url := base_url || '/functions/v1/vd-run-auto-draw';

    FOR r IN 
        SELECT e.id FROM public.vd_events e
        JOIN public.vd_event_sessions s ON s.event_id = e.id
        WHERE e.status = 'active' AND s.updated_at < now() - INTERVAL '3 minutes'
    LOOP
        -- Asynchronously re-trigger the orchestrator
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

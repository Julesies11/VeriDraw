-- migrations/2026062406_enable_realtime_publication.sql
-- Enforces that all three VeriDraw tables are added to the Supabase Realtime publication.
-- This ensures that anonymous spectators receive instant Postgres CDC updates for draws.

DO $$
BEGIN
    -- 1. Ensure supabase_realtime publication exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;

    -- 2. Add vd_event_items to publication if not already added
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'vd_event_items'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.vd_event_items;
    END IF;
    
    -- 3. Add vd_event_sessions to publication if not already added
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'vd_event_sessions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.vd_event_sessions;
    END IF;

    -- 4. Add vd_events to publication if not already added
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'vd_events'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.vd_events;
    END IF;
END $$;

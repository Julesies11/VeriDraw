-- migrations/2026062600_add_privacy_settings_to_events.sql

-- 1. Add privacy columns to public.vd_events
ALTER TABLE public.vd_events 
ADD COLUMN IF NOT EXISTS require_viewer_login BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS enable_public_link BOOLEAN NOT NULL DEFAULT true;

-- 2. Update SELECT RLS policies for vd_event_items and vd_event_sessions
DROP POLICY IF EXISTS select_vd_event_items ON public.vd_event_items;
CREATE POLICY select_vd_event_items ON public.vd_event_items
    FOR SELECT TO authenticated, anon USING (
        EXISTS (
            SELECT 1 FROM public.vd_events e
            WHERE e.id = event_id
            AND (NOT e.require_viewer_login OR auth.uid() IS NOT NULL)
        )
    );

DROP POLICY IF EXISTS select_vd_event_sessions ON public.vd_event_sessions;
CREATE POLICY select_vd_event_sessions ON public.vd_event_sessions
    FOR SELECT TO authenticated, anon USING (
        EXISTS (
            SELECT 1 FROM public.vd_events e
            WHERE e.id = event_id
            AND (NOT e.require_viewer_login OR auth.uid() IS NOT NULL)
        )
    );

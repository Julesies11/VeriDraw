-- migrations/2026061601_allow_anonymous_draws_rls.sql
-- Migration to allow anonymous users to insert events and event items, and track parent draws.

-- 1. Add duplicated_from column referencing vd_events(id)
ALTER TABLE public.vd_events ADD COLUMN IF NOT EXISTS duplicated_from UUID;

ALTER TABLE public.vd_events DROP CONSTRAINT IF EXISTS vd_events_duplicated_from_fkey;
ALTER TABLE public.vd_events
    ADD CONSTRAINT vd_events_duplicated_from_fkey 
    FOREIGN KEY (duplicated_from) REFERENCES public.vd_events(id) ON DELETE SET NULL;

-- 2. Allow anonymous users to insert events and event items for Quick Draws.
DROP POLICY IF EXISTS insert_vd_events ON public.vd_events;
CREATE POLICY insert_vd_events ON public.vd_events
    FOR INSERT TO authenticated, anon WITH CHECK (
        (auth.uid() IS NOT NULL AND auth.uid() = created_by) OR
        (auth.uid() IS NULL AND created_by IS NULL)
    );

-- Secure insertion: only creator of event can add items (or anyone if event is anonymous)
DROP POLICY IF EXISTS insert_vd_event_items ON public.vd_event_items;
CREATE POLICY insert_vd_event_items ON public.vd_event_items
    FOR INSERT TO authenticated, anon WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.vd_events 
            WHERE id = event_id AND (
                (created_by IS NOT NULL AND created_by = auth.uid()) OR
                (created_by IS NULL)
            )
        )
    );

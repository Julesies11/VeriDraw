-- 2026061500_create_veridraw_tables.sql
-- Initial schema setup for VeriDraw application with 'vd_' prefixed tables.

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================================================================
-- 1. TABLES SETUP
-- =========================================================================

-- Events Table
CREATE TABLE IF NOT EXISTS public.vd_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name TEXT NOT NULL,
    scheduled_start_time TIMESTAMPTZ NOT NULL,
    item_type TEXT NOT NULL, -- 'names', 'numbers', 'dates', 'custom'
    select_count INTEGER NOT NULL DEFAULT 1 CHECK (select_count > 0),
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed')),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Event Items Table
CREATE TABLE IF NOT EXISTS public.vd_event_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.vd_events(id) ON DELETE CASCADE,
    item_value TEXT NOT NULL,
    is_selected BOOLEAN NOT NULL DEFAULT false,
    selection_order INTEGER,
    selected_at TIMESTAMPTZ,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Event Live Sessions Table
CREATE TABLE IF NOT EXISTS public.vd_event_sessions (
    event_id UUID PRIMARY KEY REFERENCES public.vd_events(id) ON DELETE CASCADE,
    current_status TEXT NOT NULL DEFAULT 'idle' CHECK (current_status IN ('idle', 'spinning', 'landed')),
    active_winner_id UUID REFERENCES public.vd_event_items(id) ON DELETE SET NULL,
    spin_start_time TIMESTAMPTZ,
    spin_duration_ms INTEGER NOT NULL DEFAULT 4000,
    last_spin_angle NUMERIC NOT NULL DEFAULT 0,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================================
-- 2. TRIGGER FOR UPDATED_AT SESSIONS & EVENTS
-- =========================================================================

CREATE OR REPLACE FUNCTION public.vd_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_vd_events_updated_at
    BEFORE UPDATE ON public.vd_events
    FOR EACH ROW
    EXECUTE FUNCTION public.vd_set_updated_at();

CREATE TRIGGER trigger_vd_event_items_updated_at
    BEFORE UPDATE ON public.vd_event_items
    FOR EACH ROW
    EXECUTE FUNCTION public.vd_set_updated_at();

CREATE TRIGGER trigger_vd_event_sessions_updated_at
    BEFORE UPDATE ON public.vd_event_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.vd_set_updated_at();

-- Automatically create session record when a new event is created
CREATE OR REPLACE FUNCTION public.vd_create_event_session_trigger()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.vd_event_sessions (event_id, current_status)
    VALUES (NEW.id, 'idle');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_vd_create_event_session
    AFTER INSERT ON public.vd_events
    FOR EACH ROW
    EXECUTE FUNCTION public.vd_create_event_session_trigger();

-- =========================================================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================

ALTER TABLE public.vd_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vd_event_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vd_event_sessions ENABLE ROW LEVEL SECURITY;

-- A. Policies for vd_events
CREATE POLICY select_vd_events ON public.vd_events
    FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY insert_vd_events ON public.vd_events
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY update_vd_events ON public.vd_events
    FOR UPDATE TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

CREATE POLICY delete_vd_events ON public.vd_events
    FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- B. Policies for vd_event_items
CREATE POLICY select_vd_event_items ON public.vd_event_items
    FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY insert_vd_event_items ON public.vd_event_items
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.vd_events 
            WHERE id = event_id AND created_by = auth.uid()
        )
    );

CREATE POLICY update_vd_event_items ON public.vd_event_items
    FOR UPDATE TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.vd_events 
            WHERE id = event_id AND created_by = auth.uid()
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.vd_events 
            WHERE id = event_id AND created_by = auth.uid()
        )
    );

CREATE POLICY delete_vd_event_items ON public.vd_event_items
    FOR DELETE TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.vd_events 
            WHERE id = event_id AND created_by = auth.uid()
        )
    );

-- C. Policies for vd_event_sessions
CREATE POLICY select_vd_event_sessions ON public.vd_event_sessions
    FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY insert_vd_event_sessions ON public.vd_event_sessions
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.vd_events 
            WHERE id = event_id AND created_by = auth.uid()
        )
    );

CREATE POLICY update_vd_event_sessions ON public.vd_event_sessions
    FOR UPDATE TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.vd_events 
            WHERE id = event_id AND created_by = auth.uid()
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.vd_events 
            WHERE id = event_id AND created_by = auth.uid()
        )
    );

CREATE POLICY delete_vd_event_sessions ON public.vd_event_sessions
    FOR DELETE TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.vd_events 
            WHERE id = event_id AND created_by = auth.uid()
        )
    );

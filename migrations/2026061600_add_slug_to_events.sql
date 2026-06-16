-- 2026061600_add_slug_to_events.sql
-- Migration to add readable slugs to events

-- 1. Add the column as nullable first
ALTER TABLE public.vd_events ADD COLUMN IF NOT EXISTS slug TEXT;

-- 2. Backfill existing records with their ID as the slug
UPDATE public.vd_events SET slug = id::text WHERE slug IS NULL;

-- 3. Make column NOT NULL and UNIQUE
ALTER TABLE public.vd_events ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.vd_events ADD CONSTRAINT vd_events_slug_unique UNIQUE (slug);

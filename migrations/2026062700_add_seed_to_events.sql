-- migrations/2026062700_add_seed_to_events.sql
-- Add seed column to vd_events table to support cryptographic audit trials.

ALTER TABLE public.vd_events ADD COLUMN IF NOT EXISTS seed TEXT;

-- migrations/2026061602_add_display_order_to_items.sql
-- Migration to add display_order column to preserve user entry sequence.

ALTER TABLE public.vd_event_items ADD COLUMN IF NOT EXISTS display_order INTEGER;

-- migrations/2026062401_configure_production_settings.sql
-- Updates the Edge Function base URL config to point to the production project reference.

UPDATE public.vd_settings 
SET value = 'https://rdnaqrzqpcicskylmsyl.supabase.co' 
WHERE key = 'edge_function_base_url';

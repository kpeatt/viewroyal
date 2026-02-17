-- Fix mutable search_path on subscription RPC functions
-- Resolves Supabase Security Advisor warning for these three functions
-- from PR #13's schema (subscriptions feature).

ALTER FUNCTION public.find_matters_near(double precision, double precision, integer, integer)
  SET search_path = 'public';

ALTER FUNCTION public.build_meeting_digest(bigint)
  SET search_path = 'public';

ALTER FUNCTION public.find_meeting_subscribers(bigint)
  SET search_path = 'public';

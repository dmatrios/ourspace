-- Let Supabase Auth accept any email address for signup.
-- Supabase Auth settings continue to control whether email confirmation is required.
drop trigger if exists ourspace_registration on auth.users;
drop function if exists private.limit_registration();

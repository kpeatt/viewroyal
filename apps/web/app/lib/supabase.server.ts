import { createClient } from '@supabase/supabase-js';
import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn("Missing Supabase Service Role credentials (SUPABASE_SECRET_KEY)");
}

// 1. Admin Client (Bypasses RLS) - LAZILY INITIALIZED
let _supabaseAdmin: ReturnType<typeof createClient> | null = null;
export function getSupabaseAdminClient() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(supabaseUrl || "", supabaseKey || "");
  }
  return _supabaseAdmin;
}

// 2. Server Client (Respects RLS, handles Auth cookies)
export function createSupabaseServerClient(request: Request, responseHeaders = new Headers()) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase URL or Anon Key");
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        const cookies = parseCookieHeader(request.headers.get('Cookie') ?? '');
        return cookies.map((c) => ({ name: c.name, value: c.value ?? '' }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          responseHeaders.append('Set-Cookie', serializeCookieHeader(name, value, options))
        );
      },
    },
  });

  return { supabase, headers: responseHeaders };
}
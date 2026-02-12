import { redirect } from "react-router";
import { createSupabaseServerClient } from "./supabase.server";

// 1. Helper to check if user is authenticated
export async function isAuthenticated(request: Request) {
  const { supabase } = createSupabaseServerClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  return !!user;
}

// 2. Helper to require authentication (redirects if not)
export async function requireAuth(request: Request) {
  const { supabase, headers } = createSupabaseServerClient(request);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const url = new URL(request.url);
    // Include headers in redirect just in case (e.g. clearing invalid session)
    throw redirect(`/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`, {
      headers,
    });
  }
  
  return user;
}

// 3. Helper to sign out
export async function signOut(request: Request) {
  const { supabase, headers } = createSupabaseServerClient(request);
  await supabase.auth.signOut();
  return redirect("/login", { headers });
}
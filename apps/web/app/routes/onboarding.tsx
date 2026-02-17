/**
 * Onboarding wizard — post-signup flow for setting up subscriptions.
 * Steps: pick topics -> set address/neighbourhood -> opt into digest.
 * Full implementation in Phase 05 Plan 02.
 */

import { redirect } from "react-router";
import type { Route } from "./+types/onboarding";
import { createSupabaseServerClient } from "../lib/supabase.server";

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  // Placeholder: redirect to settings until Plan 02 implements the wizard
  return redirect("/settings");
}

export default function Onboarding() {
  return null;
}

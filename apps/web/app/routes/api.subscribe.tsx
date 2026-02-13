import type { Route } from "./+types/api.subscribe";
import { createSupabaseServerClient } from "../lib/supabase.server";
import {
  addSubscription,
  removeSubscription,
  checkSubscription,
} from "../services/subscriptions";
import type { SubscriptionType } from "../lib/types";

/**
 * POST /api/subscribe
 * Body: { type, matter_id?, topic_id?, person_id?, neighborhood? }
 *
 * DELETE /api/subscribe
 * Body: { subscription_id }
 *
 * GET /api/subscribe?type=matter&target_id=123
 * Returns { subscribed: boolean, subscription_id?: number }
 */
export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ subscribed: false }, { status: 401 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") as SubscriptionType;
  const targetId = Number(url.searchParams.get("target_id"));

  if (!type || !targetId) {
    return Response.json({ error: "type and target_id required" }, { status: 400 });
  }

  const sub = await checkSubscription(supabase, user.id, type, targetId);
  return Response.json({
    subscribed: !!sub,
    subscription_id: sub?.id || null,
  });
}

export async function action({ request }: Route.ActionArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (request.method === "DELETE") {
    const body = (await request.json()) as { subscription_id?: number };
    const subscriptionId = body.subscription_id;

    if (!subscriptionId) {
      return Response.json({ error: "subscription_id required" }, { status: 400 });
    }

    await removeSubscription(supabase, user.id, subscriptionId);
    return Response.json({ success: true });
  }

  // POST - add subscription
  const body = (await request.json()) as {
    type?: string;
    matter_id?: number;
    topic_id?: number;
    person_id?: number;
    neighborhood?: string;
    proximity_radius_m?: number;
  };
  const { type, matter_id, topic_id, person_id, neighborhood, proximity_radius_m } =
    body;

  if (!type) {
    return Response.json({ error: "type is required" }, { status: 400 });
  }

  const sub = await addSubscription(
    supabase,
    user.id,
    type as SubscriptionType,
    {
      matter_id: matter_id || undefined,
      topic_id: topic_id || undefined,
      person_id: person_id || undefined,
      neighborhood: neighborhood || undefined,
      proximity_radius_m: proximity_radius_m || undefined,
    },
  );

  return Response.json({ success: true, subscription: sub });
}

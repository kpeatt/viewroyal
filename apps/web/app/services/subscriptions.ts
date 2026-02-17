import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  UserProfile,
  Subscription,
  SubscriptionType,
  DigestFrequency,
  MeetingDigest,
  NearbyMatter,
} from "../lib/types";

// ── User Profiles ──

export async function getUserProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    throw error;
  }
  return data as UserProfile;
}

export async function upsertUserProfile(
  supabase: SupabaseClient,
  userId: string,
  profile: Partial<
    Pick<
      UserProfile,
      | "display_name"
      | "address"
      | "neighborhood"
      | "notification_email"
      | "digest_frequency"
      | "digest_enabled"
    >
  >,
): Promise<UserProfile> {
  const { data, error } = await supabase
    .from("user_profiles")
    .upsert({ id: userId, ...profile }, { onConflict: "id" })
    .select()
    .single();

  if (error) throw error;
  return data as UserProfile;
}

// ── Subscriptions ──

export async function getSubscriptions(
  supabase: SupabaseClient,
  userId: string,
): Promise<Subscription[]> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      `
      *,
      matter:matters(id, title, identifier, status, category),
      topic:topics(id, name),
      person:people(id, name, image_url)
    `,
    )
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as Subscription[];
}

export async function addSubscription(
  supabase: SupabaseClient,
  userId: string,
  type: SubscriptionType,
  target: {
    matter_id?: number;
    topic_id?: number;
    person_id?: number;
    neighborhood?: string;
    proximity_radius_m?: number;
    keyword?: string;
    keyword_embedding?: number[];
  },
): Promise<Subscription> {
  const { data, error } = await supabase
    .from("subscriptions")
    .insert({
      user_id: userId,
      type,
      ...target,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Subscription;
}

/**
 * Add a keyword-based topic subscription with semantic embedding.
 * The keyword text and its 384-dim embedding are stored for cosine similarity matching.
 */
export async function addKeywordSubscription(
  supabase: SupabaseClient,
  userId: string,
  keyword: string,
  embedding: number[],
): Promise<Subscription> {
  const { data, error } = await supabase
    .from("subscriptions")
    .insert({
      user_id: userId,
      type: "topic" as SubscriptionType,
      keyword,
      keyword_embedding: embedding,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Subscription;
}

export async function removeSubscription(
  supabase: SupabaseClient,
  userId: string,
  subscriptionId: number,
): Promise<void> {
  const { error } = await supabase
    .from("subscriptions")
    .delete()
    .eq("id", subscriptionId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function checkSubscription(
  supabase: SupabaseClient,
  userId: string,
  type: SubscriptionType,
  targetId: number,
): Promise<Subscription | null> {
  const column =
    type === "matter"
      ? "matter_id"
      : type === "person"
        ? "person_id"
        : type === "topic"
          ? "topic_id"
          : null;

  if (!column) return null;

  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .eq("type", type)
    .eq(column, targetId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return data as Subscription | null;
}

// ── Meeting Digest ──

export async function getMeetingDigest(
  supabase: SupabaseClient,
  meetingId: number,
): Promise<MeetingDigest | null> {
  const { data, error } = await supabase.rpc("build_meeting_digest", {
    target_meeting_id: meetingId,
  });

  if (error) throw error;
  return data as MeetingDigest | null;
}

// ── Proximity Search ──

export async function findMattersNear(
  supabase: SupabaseClient,
  lat: number,
  lng: number,
  radiusM: number = 1000,
  limit: number = 50,
): Promise<NearbyMatter[]> {
  const { data, error } = await supabase.rpc("find_matters_near", {
    lat,
    lng,
    radius_m: radiusM,
    result_limit: limit,
  });

  if (error) throw error;
  return (data || []) as NearbyMatter[];
}

import { useState } from "react";
import { Form, redirect, useActionData, Link } from "react-router";
import type { Route } from "./+types/settings";
import { createSupabaseServerClient } from "../lib/supabase.server";
import {
  getUserProfile,
  upsertUserProfile,
  getSubscriptions,
  removeSubscription,
} from "../services/subscriptions";
import { getTopics } from "../services/topics";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Settings as SettingsIcon,
  Bell,
  MapPin,
  Tag,
  User,
  FileText,
  Trash2,
  Check,
  Map,
  AlertCircle,
  Plus,
  X,
  Loader2,
  Key,
} from "lucide-react";
import { cn } from "../lib/utils";
import type {
  UserProfile,
  Subscription,
  Topic,
} from "../lib/types";

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers } = createSupabaseServerClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw redirect("/login?redirectTo=/settings", { headers });
  }

  const [profile, subscriptions, topics] = await Promise.all([
    getUserProfile(supabase, user.id),
    getSubscriptions(supabase, user.id),
    getTopics(supabase),
  ]);

  return { user, profile, subscriptions, topics };
}

export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers } = createSupabaseServerClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw redirect("/login?redirectTo=/settings", { headers });
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "update_profile") {
    const display_name = (formData.get("display_name") as string) || undefined;
    const address = (formData.get("address") as string) || undefined;
    const neighborhood = (formData.get("neighborhood") as string) || undefined;
    const notification_email =
      (formData.get("notification_email") as string) || undefined;
    const digest_enabled = formData.get("digest_enabled") === "on";
    const lat = formData.get("lat") ? parseFloat(formData.get("lat") as string) : null;
    const lng = formData.get("lng") ? parseFloat(formData.get("lng") as string) : null;

    await upsertUserProfile(supabase, user.id, {
      display_name,
      address,
      neighborhood,
      notification_email,
      digest_frequency: ((formData.get("digest_frequency") as string) || "each_meeting") as "each_meeting" | "weekly",
      digest_enabled,
    });

    // If geocoded coordinates are provided, update geography via RPC
    if (lat != null && lng != null) {
      await supabase.rpc("update_user_location", {
        target_user_id: user.id,
        lng,
        lat,
      });
    }

    return { success: true, message: "Profile updated." };
  }

  if (intent === "remove_subscription") {
    const subscriptionId = Number(formData.get("subscription_id"));
    if (subscriptionId) {
      await removeSubscription(supabase, user.id, subscriptionId);
    }
    return { success: true, message: "Subscription removed." };
  }

  return { error: "Unknown action." };
}

// TODO: Make dynamic when multi-town support is needed
const VIEW_ROYAL_NEIGHBORHOODS = [
  "Atkins/Portage",
  "Burnside",
  "Chilco",
  "Craigflower",
  "Eagle Creek",
  "Helmcken",
  "Hospital",
  "Island Highway",
  "Nursery Hill",
  "Six Mile",
  "Thetis Heights",
  "View Royal Town Centre",
];

const PROXIMITY_OPTIONS = [
  { value: 500, label: "500m" },
  { value: 1000, label: "1km" },
  { value: 2000, label: "2km" },
  { value: 3000, label: "3km" },
];

const subscriptionTypeIcon: Record<string, React.ElementType> = {
  matter: FileText,
  topic: Tag,
  person: User,
  neighborhood: MapPin,
  digest: Bell,
};

const subscriptionTypeLabel: Record<string, string> = {
  matter: "Matter",
  topic: "Topic",
  person: "Councillor",
  neighborhood: "Location",
  digest: "Meeting Digest",
};

function SubscriptionCard({ sub }: { sub: Subscription }) {
  const Icon = subscriptionTypeIcon[sub.type] || Bell;
  const label = subscriptionTypeLabel[sub.type] || sub.type;

  let title = label;
  if (sub.type === "matter" && sub.matter) {
    title = sub.matter.title;
  } else if (sub.type === "topic" && sub.keyword) {
    title = `"${sub.keyword}"`;
  } else if (sub.type === "topic" && sub.topic) {
    title = sub.topic.name;
  } else if (sub.type === "person" && sub.person) {
    title = sub.person.name;
  } else if (sub.type === "neighborhood" && sub.neighborhood) {
    title = sub.neighborhood;
  } else if (sub.type === "digest") {
    title = "Meeting Digest";
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-zinc-200 group">
      <div
        className={cn(
          "p-2 rounded-lg",
          sub.type === "digest"
            ? "bg-blue-50 text-blue-600"
            : sub.type === "neighborhood"
              ? "bg-green-50 text-green-600"
              : sub.type === "topic"
                ? "bg-purple-50 text-purple-600"
                : "bg-zinc-100 text-zinc-500",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-zinc-900 truncate">
          {title}
        </div>
        <div className="text-xs text-zinc-400">
          {sub.keyword ? "Keyword" : label}
        </div>
      </div>
      {sub.type !== "digest" && (
        <Form method="post">
          <input type="hidden" name="intent" value="remove_subscription" />
          <input type="hidden" name="subscription_id" value={sub.id} />
          <button
            type="submit"
            className="p-1.5 text-zinc-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
            title="Unsubscribe"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </Form>
      )}
    </div>
  );
}

// ── Topic Category Toggles ──

function TopicCategoryGrid({
  topics,
  subscriptions,
}: {
  topics: Topic[];
  subscriptions: Subscription[];
}) {
  const [loading, setLoading] = useState<number | null>(null);

  // Find which topics the user is subscribed to
  const subscribedTopicIds = new Set(
    subscriptions
      .filter((s) => s.type === "topic" && s.topic_id && !s.keyword)
      .map((s) => s.topic_id!),
  );

  // Map topic_id -> subscription_id for unsubscribing
  const topicSubMap: Record<number, number> = {};
  for (const s of subscriptions) {
    if (s.type === "topic" && s.topic_id && !s.keyword) {
      topicSubMap[s.topic_id] = s.id;
    }
  }

  async function toggleTopic(topicId: number) {
    setLoading(topicId);
    try {
      if (subscribedTopicIds.has(topicId)) {
        const subId = topicSubMap[topicId];
        if (subId) {
          await fetch("/api/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscription_id: subId }),
          });
        }
      } else {
        await fetch("/api/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "topic", topic_id: topicId }),
        });
      }
      // Reload to reflect changes
      window.location.reload();
    } catch (err) {
      console.error("Topic toggle error:", err);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {topics.map((topic) => {
        const subscribed = subscribedTopicIds.has(topic.id);
        const isLoading = loading === topic.id;
        return (
          <button
            key={topic.id}
            type="button"
            onClick={() => toggleTopic(topic.id)}
            disabled={isLoading}
            className={cn(
              "flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-all text-sm",
              subscribed
                ? "border-blue-500 bg-blue-50"
                : "border-zinc-200 bg-white hover:border-zinc-300",
              isLoading && "opacity-50",
            )}
          >
            <div
              className={cn(
                "w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                subscribed
                  ? "border-blue-500 bg-blue-500"
                  : "border-zinc-300 bg-white",
              )}
            >
              {isLoading ? (
                <Loader2 className="h-2.5 w-2.5 text-white animate-spin" />
              ) : (
                subscribed && <Check className="h-2.5 w-2.5 text-white" />
              )}
            </div>
            <span
              className={cn(
                "truncate font-medium",
                subscribed ? "text-blue-700" : "text-zinc-700",
              )}
            >
              {topic.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Keyword Management ──

function KeywordManager({
  subscriptions,
}: {
  subscriptions: Subscription[];
}) {
  const [keywordInput, setKeywordInput] = useState("");
  const [adding, setAdding] = useState(false);

  const keywordSubs = subscriptions.filter(
    (s) => s.type === "topic" && s.keyword,
  );

  async function addKeyword() {
    const kw = keywordInput.trim().toLowerCase();
    if (!kw) return;
    setAdding(true);
    try {
      await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "topic", keyword: kw }),
      });
      setKeywordInput("");
      window.location.reload();
    } catch (err) {
      console.error("Add keyword error:", err);
    } finally {
      setAdding(false);
    }
  }

  async function removeKeyword(subId: number) {
    try {
      await fetch("/api/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription_id: subId }),
      });
      window.location.reload();
    } catch (err) {
      console.error("Remove keyword error:", err);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
          placeholder='e.g. "housing", "bike lanes"'
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addKeyword();
            }
          }}
          disabled={adding}
        />
        <Button
          type="button"
          variant="outline"
          onClick={addKeyword}
          disabled={!keywordInput.trim() || adding}
        >
          {adding ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </Button>
      </div>

      {keywordSubs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {keywordSubs.map((sub) => (
            <Badge
              key={sub.id}
              variant="secondary"
              className="gap-1 pl-2.5 pr-1.5 py-1 cursor-pointer hover:bg-zinc-200"
              onClick={() => removeKeyword(sub.id)}
            >
              {sub.keyword}
              <X className="h-3 w-3" />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Address with Geocoding ──

function AddressField({
  defaultAddress,
  defaultNeighborhood,
}: {
  defaultAddress: string;
  defaultNeighborhood: string;
}) {
  const [address, setAddress] = useState(defaultAddress);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeResult, setGeocodeResult] = useState<{
    lat: number;
    lng: number;
    display_name: string;
  } | null>(null);
  const [geocodeError, setGeocodeError] = useState("");

  async function handleGeocode() {
    if (!address.trim()) return;
    setGeocoding(true);
    setGeocodeError("");
    setGeocodeResult(null);

    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address.trim() }),
      });
      const data = (await res.json()) as {
        lat?: number;
        lng?: number;
        display_name?: string;
        error?: string;
      };
      if (res.ok && data.lat && data.lng) {
        setGeocodeResult({
          lat: data.lat,
          lng: data.lng,
          display_name: data.display_name || address,
        });
      } else {
        setGeocodeError(
          data.error ||
            "Could not find that address. Try adding more detail.",
        );
      }
    } catch {
      setGeocodeError("Geocoding failed -- please try again.");
    } finally {
      setGeocoding(false);
    }
  }

  return (
    <>
      <div className="space-y-1">
        <label className="text-sm font-medium text-zinc-700 flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-zinc-400" />
          Street Address
        </label>
        <div className="flex gap-2">
          <Input
            name="address"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              setGeocodeResult(null);
              setGeocodeError("");
            }}
            placeholder="e.g. 45 View Royal Ave"
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleGeocode}
            disabled={geocoding || !address.trim()}
            className="flex-shrink-0"
          >
            {geocoding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Locate"
            )}
          </Button>
        </div>

        {geocodeResult && (
          <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
            <Check className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{geocodeResult.display_name}</span>
          </div>
        )}

        {geocodeError && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
            {geocodeError}
          </p>
        )}

        <p className="text-xs text-zinc-400">
          Click "Locate" to verify your address for proximity alerts.
        </p>
      </div>

      {/* Hidden fields for geocoded coordinates */}
      {geocodeResult && (
        <>
          <input type="hidden" name="lat" value={geocodeResult.lat} />
          <input type="hidden" name="lng" value={geocodeResult.lng} />
        </>
      )}
    </>
  );
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { user, profile, subscriptions, topics } = loaderData;
  const actionData = useActionData<typeof action>();

  // Determine the existing proximity radius from neighbourhood subscription
  const neighborhoodSub = subscriptions.find(
    (s) => s.type === "neighborhood",
  );

  // Non-topic/keyword/digest subscriptions for the "Active Subscriptions" section
  const otherSubscriptions = subscriptions.filter(
    (s) => !((s.type === "topic" && !s.keyword) || s.type === "digest"),
  );

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="container mx-auto py-12 px-4 max-w-2xl">
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-600 rounded-lg">
              <SettingsIcon className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">
              Settings
            </h1>
          </div>
          <p className="text-zinc-500">
            Manage your profile, notification preferences, and subscriptions.
          </p>
        </header>

        {actionData && "success" in actionData && (
          <div className="mb-6 p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 text-sm text-green-700 font-medium">
            <Check className="h-4 w-4" />
            {actionData.message}
          </div>
        )}

        {actionData && "error" in actionData && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700 font-medium">
            <AlertCircle className="h-4 w-4" />
            {actionData.error}
          </div>
        )}

        {/* Quick Links */}
        <section className="mb-8">
          <Link
            to="/settings/api-keys"
            className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm hover:border-zinc-300 hover:shadow transition-all group"
          >
            <div className="p-2 bg-amber-50 rounded-lg group-hover:bg-amber-100 transition-colors">
              <Key className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">API Keys</h3>
              <p className="text-xs text-zinc-500">Manage API keys for the ViewRoyal.ai API</p>
            </div>
          </Link>
        </section>

        {/* Profile Section */}
        <section className="mb-8">
          <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
            <User className="h-4 w-4" />
            Profile
          </h2>
          <Form
            method="post"
            className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4"
          >
            <input type="hidden" name="intent" value="update_profile" />

            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">
                Display Name
              </label>
              <Input
                name="display_name"
                defaultValue={profile?.display_name || ""}
                placeholder="How you'd like to be addressed"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">
                Notification Email
              </label>
              <Input
                type="email"
                name="notification_email"
                defaultValue={profile?.notification_email || user.email || ""}
                placeholder="Where to send alerts"
              />
              <p className="text-xs text-zinc-400">
                Defaults to your login email if left blank.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AddressField
                defaultAddress={profile?.address || ""}
                defaultNeighborhood={profile?.neighborhood || ""}
              />

              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700 flex items-center gap-1.5">
                  <Map className="h-3.5 w-3.5 text-zinc-400" />
                  Neighbourhood
                </label>
                <select
                  name="neighborhood"
                  defaultValue={profile?.neighborhood || ""}
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Select neighbourhood</option>
                  {VIEW_ROYAL_NEIGHBORHOODS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Proximity radius — only show when address or neighbourhood is set */}
            {(profile?.address || profile?.neighborhood || neighborhoodSub) && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">
                  Alert radius
                </label>
                <div className="flex gap-2">
                  {PROXIMITY_OPTIONS.map((opt) => {
                    const currentRadius =
                      neighborhoodSub?.proximity_radius_m || 1000;
                    return (
                      <label
                        key={opt.value}
                        className={cn(
                          "flex-1 px-3 py-2 rounded-lg border text-sm font-medium text-center cursor-pointer transition-colors",
                          currentRadius === opt.value
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
                        )}
                      >
                        <input
                          type="radio"
                          name="proximity_radius"
                          value={opt.value}
                          defaultChecked={currentRadius === opt.value}
                          className="sr-only"
                        />
                        {opt.label}
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-zinc-400">
                  How far from your location should we look for relevant
                  matters?
                </p>
              </div>
            )}

            <div className="border-t border-zinc-100 pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                <Bell className="h-4 w-4 text-blue-600" />
                Meeting Digest
              </h3>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="digest_enabled"
                  defaultChecked={profile?.digest_enabled ?? false}
                  className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-zinc-700">
                  Receive meeting digest after each council meeting
                </span>
              </label>
              <p className="text-xs text-zinc-400 ml-7">
                Key decisions, vote results, and what it means for your
                neighbourhood -- sent after each meeting with content.
              </p>
              <div className="ml-7 mt-2 space-y-1">
                <label className="text-sm font-medium text-zinc-700">
                  Digest Frequency
                </label>
                <select
                  name="digest_frequency"
                  defaultValue={profile?.digest_frequency || "each_meeting"}
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="each_meeting">After each meeting</option>
                  <option value="weekly">Weekly summary</option>
                </select>
                <p className="text-xs text-zinc-400">
                  Choose how often you receive digest emails.
                </p>
              </div>
            </div>

            <Button type="submit" className="w-full">
              Save Profile
            </Button>
          </Form>
        </section>

        {/* Topic Subscriptions Section */}
        <section className="mb-8">
          <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Topic Subscriptions
          </h2>

          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 mb-1">
                Categories
              </h3>
              <p className="text-xs text-zinc-500 mb-3">
                Get notified when agenda items match these categories.
              </p>
              <TopicCategoryGrid
                topics={topics}
                subscriptions={subscriptions}
              />
            </div>

            <div className="border-t border-zinc-100 pt-4">
              <h3 className="text-sm font-semibold text-zinc-900 mb-1">
                Keywords
              </h3>
              <p className="text-xs text-zinc-500 mb-3">
                Add custom terms for semantic matching against agenda item
                content.
              </p>
              <KeywordManager subscriptions={subscriptions} />
            </div>
          </div>
        </section>

        {/* Active Subscriptions Section */}
        <section>
          <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Active Subscriptions
          </h2>

          {otherSubscriptions.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border border-dashed border-zinc-200 text-center space-y-3">
              <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mx-auto">
                <Bell className="h-6 w-6 text-zinc-300" />
              </div>
              <h3 className="font-bold text-zinc-900">No subscriptions yet</h3>
              <p className="text-sm text-zinc-500 max-w-sm mx-auto">
                Browse{" "}
                <a href="/matters" className="text-blue-600 hover:underline">
                  matters
                </a>
                ,{" "}
                <a href="/people" className="text-blue-600 hover:underline">
                  council members
                </a>
                , or{" "}
                <a href="/meetings" className="text-blue-600 hover:underline">
                  meetings
                </a>{" "}
                and click the subscribe button to follow them.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {otherSubscriptions.map((sub) => (
                <SubscriptionCard key={sub.id} sub={sub} />
              ))}
            </div>
          )}

          <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
            <h3 className="text-sm font-semibold text-blue-900 mb-1">
              How alerts work
            </h3>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>
                Meeting digests are only sent after meetings with actual content
                (minutes or transcripts) -- not for agenda-only meetings.
              </li>
              <li>
                Matter alerts fire when a matter you follow appears on a meeting
                agenda.
              </li>
              <li>
                Topic alerts use semantic matching to find related discussions.
              </li>
              <li>
                Location alerts notify you about decisions affecting your
                neighbourhood.
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

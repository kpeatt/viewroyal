import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/settings";
import { createSupabaseServerClient } from "../lib/supabase.server";
import {
  getUserProfile,
  upsertUserProfile,
  getSubscriptions,
  removeSubscription,
} from "../services/subscriptions";
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
} from "lucide-react";
import { cn } from "../lib/utils";
import type {
  UserProfile,
  Subscription,
  DigestFrequency,
} from "../lib/types";

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers } = createSupabaseServerClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw redirect("/login?redirectTo=/settings", { headers });
  }

  const [profile, subscriptions] = await Promise.all([
    getUserProfile(supabase, user.id),
    getSubscriptions(supabase, user.id),
  ]);

  return { user, profile, subscriptions };
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
    const digest_frequency = (formData.get("digest_frequency") as DigestFrequency) || "each_meeting";
    const digest_enabled = formData.get("digest_enabled") === "on";

    await upsertUserProfile(supabase, user.id, {
      display_name,
      address,
      neighborhood,
      notification_email,
      digest_frequency,
      digest_enabled,
    });

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
              : "bg-zinc-100 text-zinc-500",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-zinc-900 truncate">
          {title}
        </div>
        <div className="text-xs text-zinc-400">{label}</div>
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

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { user, profile, subscriptions } = loaderData;
  const actionData = useActionData<typeof action>();

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
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-zinc-400" />
                  Street Address
                </label>
                <Input
                  name="address"
                  defaultValue={profile?.address || ""}
                  placeholder="e.g. 45 View Royal Ave"
                />
                <p className="text-xs text-zinc-400">
                  Used for proximity alerts about nearby matters.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700 flex items-center gap-1.5">
                  <Map className="h-3.5 w-3.5 text-zinc-400" />
                  Neighborhood
                </label>
                <select
                  name="neighborhood"
                  defaultValue={profile?.neighborhood || ""}
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Select neighborhood</option>
                  {VIEW_ROYAL_NEIGHBORHOODS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border-t border-zinc-100 pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                <Bell className="h-4 w-4 text-blue-600" />
                Meeting Digest
              </h3>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="digest_enabled"
                  defaultChecked={profile?.digest_enabled ?? true}
                  className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-zinc-700">
                  Send me meeting digests with key decisions and votes
                </span>
              </label>

              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500">
                  Frequency
                </label>
                <div className="flex gap-2">
                  {(
                    [
                      ["each_meeting", "After each meeting"],
                      ["weekly", "Weekly summary"],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 cursor-pointer hover:border-blue-200 transition-colors text-sm has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"
                    >
                      <input
                        type="radio"
                        name="digest_frequency"
                        value={value}
                        defaultChecked={
                          (profile?.digest_frequency || "each_meeting") ===
                          value
                        }
                        className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full">
              Save Profile
            </Button>
          </Form>
        </section>

        {/* Subscriptions Section */}
        <section>
          <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Active Subscriptions
          </h2>

          {subscriptions.length === 0 ? (
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
              {subscriptions.map((sub) => (
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
                Location alerts notify you about decisions affecting your
                neighborhood.
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

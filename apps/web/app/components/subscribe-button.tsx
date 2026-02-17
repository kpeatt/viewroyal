import { useState, useEffect } from "react";
import { useRouteLoaderData, Link } from "react-router";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import type { SubscriptionType } from "../lib/types";

interface SubscribeButtonProps {
  type: SubscriptionType;
  targetId: number;
  label?: string;
  className?: string;
  compact?: boolean;
}

export function SubscribeButton({
  type,
  targetId,
  label,
  className,
  compact = false,
}: SubscribeButtonProps) {
  const rootData = useRouteLoaderData("root") as { user: any } | undefined;
  const user = rootData?.user;

  const [subscribed, setSubscribed] = useState(false);
  const [subscriptionId, setSubscriptionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  // Check subscription status on mount
  useEffect(() => {
    if (!user) return;

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/subscribe?type=${type}&target_id=${targetId}`);
        const data = (await res.json()) as { subscribed: boolean; subscription_id: number | null };
        setSubscribed(data.subscribed);
        setSubscriptionId(data.subscription_id);
      } catch {
        // ignore
      } finally {
        setChecked(true);
      }
    };
    checkStatus();
  }, [user, type, targetId]);

  if (!user) {
    return (
      <Link
        to={`/signup?redirectTo=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/")}`}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full text-sm font-semibold transition-colors",
          compact
            ? "px-2.5 py-1 text-xs"
            : "px-3 py-1.5",
          "bg-blue-50 text-blue-600 hover:bg-blue-100",
          className,
        )}
      >
        <Bell className={cn(compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
        {!compact && (label || "Follow")}
      </Link>
    );
  }

  if (!checked) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full text-sm",
          compact ? "px-2.5 py-1" : "px-3 py-1.5",
          "bg-zinc-100 text-zinc-400",
          className,
        )}
      >
        <Loader2 className={cn(compact ? "h-3 w-3" : "h-3.5 w-3.5", "animate-spin")} />
      </div>
    );
  }

  const handleToggle = async () => {
    setLoading(true);
    try {
      if (subscribed && subscriptionId) {
        await fetch("/api/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription_id: subscriptionId }),
        });
        setSubscribed(false);
        setSubscriptionId(null);
      } else {
        const column =
          type === "matter"
            ? "matter_id"
            : type === "person"
              ? "person_id"
              : type === "topic"
                ? "topic_id"
                : null;

        const body: Record<string, any> = { type };
        if (column) body[column] = targetId;

        const res = await fetch("/api/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as { subscription?: { id: number } };
        setSubscribed(true);
        setSubscriptionId(data.subscription?.id || null);
      }
    } catch (err) {
      console.error("Subscription error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full text-sm font-semibold transition-all",
        compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5",
        subscribed
          ? "bg-blue-600 text-white hover:bg-red-500"
          : "bg-blue-50 text-blue-600 hover:bg-blue-100",
        loading && "opacity-50 cursor-wait",
        className,
      )}
      title={subscribed ? "Unsubscribe" : "Subscribe to alerts"}
    >
      {loading ? (
        <Loader2 className={cn(compact ? "h-3 w-3" : "h-3.5 w-3.5", "animate-spin")} />
      ) : subscribed ? (
        <BellOff className={cn(compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
      ) : (
        <Bell className={cn(compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
      )}
      {!compact && (subscribed ? "Following" : label || "Follow")}
    </button>
  );
}

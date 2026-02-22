import { useState } from "react";
import { Form, redirect, useActionData, Link } from "react-router";
import type { Route } from "./+types/settings.api-keys";
import { createSupabaseServerClient } from "../lib/supabase.server";
import { generateApiKey, hashApiKey } from "../api/lib/api-key";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import {
  Key,
  Copy,
  Trash2,
  Check,
  ArrowLeft,
  AlertTriangle,
  Plus,
} from "lucide-react";

interface ApiKey {
  id: string;
  key_prefix: string;
  is_active: boolean;
  created_at: string;
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers } = createSupabaseServerClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw redirect("/login?redirectTo=/settings/api-keys", { headers });
  }

  const { data: keys, error } = await supabase
    .from("api_keys")
    .select("id, key_prefix, is_active, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch API keys:", error);
  }

  return { keys: (keys ?? []) as ApiKey[], user };
}

export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers } = createSupabaseServerClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw redirect("/login?redirectTo=/settings/api-keys", { headers });
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create_key") {
    // Check active key count
    const { count, error: countError } = await supabase
      .from("api_keys")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (countError) {
      return { error: "Failed to check existing keys. Please try again." };
    }

    if ((count ?? 0) >= 3) {
      return {
        error:
          "Maximum 3 active API keys allowed. Revoke an existing key to create a new one.",
      };
    }

    const plainKey = generateApiKey();
    const keyHash = await hashApiKey(plainKey);
    const prefix = plainKey.substring(0, 8); // "vr_xxxxx"

    const { error: insertError } = await supabase.from("api_keys").insert({
      user_id: user.id,
      key_hash: keyHash,
      key_prefix: prefix,
      name: "Default",
      is_active: true,
    });

    if (insertError) {
      return { error: "Failed to create API key. Please try again." };
    }

    return { newKey: plainKey, prefix, success: true };
  }

  if (intent === "revoke_key") {
    const keyId = formData.get("key_id") as string;

    if (!keyId) {
      return { error: "Missing key ID." };
    }

    const { error: revokeError } = await supabase
      .from("api_keys")
      .update({ is_active: false })
      .eq("id", keyId)
      .eq("user_id", user.id);

    if (revokeError) {
      return { error: "Failed to revoke key. Please try again." };
    }

    return { success: true, revoked: true };
  }

  return { error: "Unknown action." };
}

export default function ApiKeysPage({
  loaderData,
}: Route.ComponentProps) {
  const { keys } = loaderData;
  const actionData = useActionData<typeof action>();
  const [showNewKey, setShowNewKey] = useState(true);
  const [copied, setCopied] = useState(false);
  const [revokeKeyId, setRevokeKeyId] = useState<string | null>(null);

  const activeKeys = keys.filter((k) => k.is_active);
  const revokedKeys = keys.filter((k) => !k.is_active);
  const activeCount = activeKeys.length;

  async function copyKey(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text for manual copy
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="container mx-auto py-12 px-4 max-w-2xl">
        {/* Back Link */}
        <Link
          to="/settings"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Link>

        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-500 rounded-lg">
              <Key className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">
              API Keys
            </h1>
          </div>
          <p className="text-zinc-500">
            Create and manage API keys for the ViewRoyal.ai API.
          </p>
        </header>

        {/* Error Message */}
        {actionData && "error" in actionData && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700 font-medium">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {actionData.error}
          </div>
        )}

        {/* New Key Reveal */}
        {actionData &&
          "newKey" in actionData &&
          actionData.newKey &&
          showNewKey && (
            <section className="mb-6">
              <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-amber-900">
                      Your new API key
                    </h3>
                    <p className="text-xs text-amber-700">
                      Save this key now -- you will not see it again.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-white border border-amber-200 rounded-lg px-4 py-3 text-sm font-mono text-zinc-900 break-all select-all">
                    {actionData.newKey}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => copyKey(actionData.newKey as string)}
                    className="flex-shrink-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewKey(false)}
                  className="text-amber-700 hover:text-amber-900"
                >
                  Dismiss
                </Button>
              </div>
            </section>
          )}

        {/* Create Key Button */}
        <section className="mb-8">
          <Form method="post">
            <input type="hidden" name="intent" value="create_key" />
            <Button
              type="submit"
              disabled={activeCount >= 3}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create API Key
            </Button>
          </Form>
          <p className="text-xs text-zinc-400 mt-2 text-center">
            {activeCount} of 3 keys used
          </p>
        </section>

        {/* Active Keys */}
        <section className="mb-8">
          <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
            <Key className="h-4 w-4" />
            Active Keys
          </h2>

          {activeKeys.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border border-dashed border-zinc-200 text-center space-y-3">
              <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mx-auto">
                <Key className="h-6 w-6 text-zinc-300" />
              </div>
              <h3 className="font-bold text-zinc-900">No active keys</h3>
              <p className="text-sm text-zinc-500 max-w-sm mx-auto">
                Create an API key to start using the ViewRoyal.ai API.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center gap-3 bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm"
                >
                  <div className="p-2 bg-amber-50 rounded-lg">
                    <Key className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <code className="text-sm font-mono text-zinc-900">
                      {key.key_prefix}...
                    </code>
                    <p className="text-xs text-zinc-400">
                      Created{" "}
                      {new Date(key.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                    Active
                  </span>
                  <Dialog
                    open={revokeKeyId === key.id}
                    onOpenChange={(open) =>
                      setRevokeKeyId(open ? key.id : null)
                    }
                  >
                    <DialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-zinc-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Revoke API Key</DialogTitle>
                        <DialogDescription>
                          Are you sure? This key will stop working
                          immediately. Any applications using this key
                          will lose access.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setRevokeKeyId(null)}
                        >
                          Cancel
                        </Button>
                        <Form method="post">
                          <input
                            type="hidden"
                            name="intent"
                            value="revoke_key"
                          />
                          <input
                            type="hidden"
                            name="key_id"
                            value={key.id}
                          />
                          <Button
                            type="submit"
                            variant="destructive"
                            onClick={() => setRevokeKeyId(null)}
                          >
                            Revoke Key
                          </Button>
                        </Form>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Revoked Keys */}
        {revokedKeys.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
              <Key className="h-4 w-4" />
              Revoked Keys
            </h2>

            <div className="space-y-2">
              {revokedKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center gap-3 bg-white/50 p-4 rounded-2xl border border-zinc-100"
                >
                  <div className="p-2 bg-zinc-50 rounded-lg">
                    <Key className="h-4 w-4 text-zinc-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <code className="text-sm font-mono text-zinc-400">
                      {key.key_prefix}...
                    </code>
                    <p className="text-xs text-zinc-300">
                      Created{" "}
                      {new Date(key.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-500 ring-1 ring-inset ring-zinc-500/10">
                    Revoked
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Info Section */}
        <section>
          <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Usage
          </h2>

          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
            <div className="space-y-3 text-sm text-zinc-600">
              <p>
                Pass your key in the{" "}
                <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-xs font-mono">
                  X-API-Key
                </code>{" "}
                header or as a{" "}
                <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-xs font-mono">
                  ?apikey=
                </code>{" "}
                query parameter.
              </p>

              <p>
                Explore the API at{" "}
                <Link
                  to="/api/v1/docs"
                  className="text-blue-600 hover:underline font-medium"
                >
                  /api/v1/docs
                </Link>
              </p>

              <p className="text-xs text-zinc-400">
                API keys are rate-limited. If you exceed the limit, requests
                will return a 429 status. Contact us if you need higher
                limits.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

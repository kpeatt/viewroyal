import { Form, redirect, useActionData } from "react-router";
import type { Route } from "./+types/login";
import { createSupabaseServerClient } from "../lib/supabase.server";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { ShieldAlert, ShieldCheck } from "lucide-react";

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirectTo") || "/";

  // Create client that handles cookies
  const { supabase, headers } = createSupabaseServerClient(request);

  // Sign in
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  // Redirect on success with Set-Cookie headers
  return redirect(redirectTo, { headers });
}

export default function Login() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="flex h-screen items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                <ShieldCheck className="h-6 w-6" />
            </div>
          <h1 className="text-xl font-bold">Admin Access</h1>
          <p className="text-sm text-zinc-500">Sign in with your Supabase credentials.</p>
        </div>

        <Form method="post" className="space-y-4">
          <div className="space-y-3">
            <Input
              type="email"
              name="email"
              placeholder="Email"
              required
              autoFocus
              className="w-full"
            />
            <Input
              type="password"
              name="password"
              placeholder="Password"
              required
              className="w-full"
            />
            {actionData?.error && (
              <p className="text-xs text-red-500 font-medium flex items-center gap-1">
                  <ShieldAlert className="h-3 w-3" />
                  {actionData.error}
              </p>
            )}
          </div>
          <Button type="submit" className="w-full">
            Sign In
          </Button>
        </Form>
      </div>
    </div>
  );
}
import { Form, Link, redirect, useActionData } from "react-router";
import type { Route } from "./+types/signup";
import { createSupabaseServerClient } from "../lib/supabase.server";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Bell, AlertCircle } from "lucide-react";

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const displayName = formData.get("displayName") as string;
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirectTo") || "/onboarding";

  const { supabase, headers } = createSupabaseServerClient(request);

  // Sign up
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
    },
  });

  if (error) {
    return { error: error.message };
  }

  // Create user profile
  if (data.user) {
    const { error: profileError } = await supabase
      .from("user_profiles")
      .insert({
        id: data.user.id,
        display_name: displayName || null,
        notification_email: email,
      });

    if (profileError) {
      console.error("Error creating user profile:", profileError);
    }
  }

  // If email confirmation is required, tell the user
  if (data.user && !data.session) {
    return { success: true, confirmEmail: true };
  }

  return redirect(redirectTo, { headers });
}

export default function Signup() {
  const actionData = useActionData<typeof action>();

  if (actionData && "success" in actionData && actionData.confirmEmail) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <div className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-6 shadow-sm text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600 mx-auto">
            <Bell className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold">Check your email</h1>
          <p className="text-sm text-zinc-500">
            We sent you a confirmation link. Click it to activate your account
            and start receiving council alerts.
          </p>
          <Link
            to="/login"
            className="text-sm text-blue-600 hover:underline font-medium"
          >
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <Bell className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold">Get Council Alerts</h1>
          <p className="text-sm text-zinc-500 text-center">
            Sign up to follow matters, get meeting digests, and receive alerts
            about activity near you.
          </p>
        </div>

        <Form method="post" className="space-y-4">
          <div className="space-y-3">
            <Input
              type="text"
              name="displayName"
              placeholder="Display name (optional)"
              className="w-full"
            />
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
              placeholder="Password (min 6 characters)"
              required
              minLength={6}
              className="w-full"
            />
            {actionData &&
              "error" in actionData &&
              actionData.error && (
                <p className="text-xs text-red-500 font-medium flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {actionData.error}
                </p>
              )}
          </div>
          <Button type="submit" className="w-full">
            Create Account
          </Button>
        </Form>

        <p className="text-xs text-zinc-400 text-center">
          Already have an account?{" "}
          <Link
            to="/login"
            className="text-blue-600 hover:underline font-medium"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

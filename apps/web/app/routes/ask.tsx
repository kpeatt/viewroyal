import { redirect } from "react-router";
import type { Route } from "./+types/ask";

export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  const person = url.searchParams.get("person");
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (person) params.set("person", person);
  const searchUrl = params.toString() ? `/search?${params.toString()}` : "/search";
  return redirect(searchUrl, 301);
}

export default function AskRedirect() {
  return null; // Never rendered due to redirect
}

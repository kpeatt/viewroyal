import { signOut } from "../lib/auth.server";
import type { Route } from "./+types/logout";

export async function action({ request }: Route.ActionArgs) {
  return signOut(request);
}

export async function loader({ request }: Route.LoaderArgs) {
  return signOut(request);
}

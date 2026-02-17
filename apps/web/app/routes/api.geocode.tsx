import type { Route } from "./+types/api.geocode";
import { createSupabaseServerClient } from "../lib/supabase.server";

/**
 * POST /api/geocode
 * Body: { address: string }
 * Returns: { lat: number, lng: number } or { error: string }
 *
 * Server-side geocoding via Nominatim, biased to View Royal, BC.
 * Requires authentication.
 */
export async function action({ request }: Route.ActionArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { address?: string };
    const address = body.address?.trim();

    if (!address) {
      return Response.json(
        { error: "address is required" },
        { status: 400 },
      );
    }

    // View Royal bounding box for biasing results
    const viewBox = "-123.55,48.42,-123.40,48.48";
    const query = `${address}, View Royal, BC, Canada`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&viewbox=${viewBox}&bounded=0`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "ViewRoyal.ai/1.0 (civic platform)",
      },
    });

    if (!response.ok) {
      console.error("Nominatim API error:", response.status, response.statusText);
      return Response.json(
        { error: "Geocoding service unavailable" },
        { status: 502 },
      );
    }

    const results = (await response.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
    }>;

    if (results.length === 0) {
      return Response.json({ error: "Address not found" }, { status: 404 });
    }

    return Response.json({
      lat: parseFloat(results[0].lat),
      lng: parseFloat(results[0].lon),
      display_name: results[0].display_name,
    });
  } catch (err) {
    console.error("Geocode action error:", err);
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}

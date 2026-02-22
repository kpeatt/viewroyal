import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { ApiEnv } from "../../types";
import type { Context } from "hono";
import { getSupabaseAdminClient } from "~/lib/supabase.server";
import { detailResponse } from "../../lib/envelope";
import { serializePersonDetail } from "../../serializers/person";
import { ApiError } from "../../lib/api-errors";

export class GetPerson extends OpenAPIRoute {
  schema = {
    tags: ["People"],
    security: [{ ApiKeyAuth: [] }],
    summary: "Get person detail",
    description:
      "Returns a single person with memberships and voting summary.",
    request: {
      params: z.object({
        slug: z.string().describe("Person slug"),
        municipality: z.string().describe("Municipality slug"),
      }),
    },
    responses: {
      "200": {
        description: "Person detail",
        content: {
          "application/json": {
            schema: z.object({
              data: z.object({
                slug: z.string().nullable(),
                name: z.string().nullable(),
                is_current_councillor: z.boolean(),
                party: z.null(),
                image_url: z.string().nullable(),
                memberships: z.array(
                  z.object({
                    organization_name: z.string().nullable(),
                    role: z.string().nullable(),
                    start_date: z.string().nullable(),
                    end_date: z.string().nullable(),
                  }),
                ),
                voting_summary: z.object({
                  total_votes: z.number(),
                  votes_for: z.number(),
                  votes_against: z.number(),
                  abstentions: z.number(),
                }),
              }),
              meta: z.object({
                request_id: z.string(),
              }),
            }),
          },
        },
      },
      "404": {
        description: "Person not found",
      },
    },
  };

  async handle(c: Context<ApiEnv>) {
    const { slug } = c.req.param();
    const muni = c.get("municipality")!;
    const supabase = getSupabaseAdminClient();

    // Look up person by slug
    const { data: person, error } = await supabase
      .from("people")
      .select(
        "id, slug, name, is_councillor, image_url, memberships(role, start_date, end_date, organization:organizations(name, municipality_id))",
      )
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      console.error("[API] GetPerson query error:", error);
      throw new ApiError(
        500,
        "QUERY_ERROR",
        "Failed to fetch person",
      );
    }

    if (!person) {
      throw new ApiError(
        404,
        "PERSON_NOT_FOUND",
        `Person "${slug}" not found.`,
      );
    }

    // Verify person belongs to this municipality via memberships
    const muniMemberships = (person.memberships ?? []).filter(
      (m: any) => m.organization?.municipality_id === muni.id,
    );

    if (muniMemberships.length === 0) {
      throw new ApiError(
        404,
        "PERSON_NOT_FOUND",
        `Person "${slug}" not found in ${muni.name}.`,
      );
    }

    // Fetch voting summary in parallel
    const [yesRes, noRes, abstainRes] = await Promise.all([
      supabase
        .from("votes")
        .select("id", { count: "exact", head: true })
        .eq("person_id", person.id)
        .or("vote.eq.Yes,vote.eq.In Favour"),
      supabase
        .from("votes")
        .select("id", { count: "exact", head: true })
        .eq("person_id", person.id)
        .or("vote.eq.No,vote.eq.Opposed"),
      supabase
        .from("votes")
        .select("id", { count: "exact", head: true })
        .eq("person_id", person.id)
        .or("vote.eq.Abstain,vote.eq.Recused"),
    ]);

    const votesFor = yesRes.count ?? 0;
    const votesAgainst = noRes.count ?? 0;
    const abstentions = abstainRes.count ?? 0;

    const serialized = serializePersonDetail(person, {
      memberships: muniMemberships,
      votingSummary: {
        total_votes: votesFor + votesAgainst + abstentions,
        votes_for: votesFor,
        votes_against: votesAgainst,
        abstentions,
      },
    });

    return detailResponse(c, serialized);
  }
}

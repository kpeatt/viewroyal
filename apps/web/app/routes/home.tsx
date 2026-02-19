import type { Route } from "./+types/home";
import { useRouteLoaderData } from "react-router";
import { getHomeData, getPublicNotices } from "../services/site";
import { createSupabaseServerClient } from "../lib/supabase.server";
import { getMunicipality } from "../services/municipality";
import type { Municipality } from "../lib/types";
import { HeroSection } from "../components/home/hero-section";
import { UpcomingMeetingSection } from "../components/home/upcoming-meeting-section";
import { RecentMeetingSection } from "../components/home/recent-meeting-section";
import { ActiveMattersSection } from "../components/home/active-matters-section";
import { DecisionsFeedSection } from "../components/home/decisions-feed-section";
import { PublicNoticesSection } from "../components/home/public-notices-section";
import { ogImageUrl, ogUrl } from "../lib/og";

export const meta: Route.MetaFunction = ({ data }) => {
  const municipality = (data as any)?.municipality as Municipality | undefined;
  const municipalityName = municipality?.name || "Town of View Royal";
  return [
    { title: "ViewRoyal.ai | Council Meeting Intelligence" },
    { name: "description", content: `Searchable database of ${municipalityName} council meetings, voting records, and AI-powered insights.` },
    { property: "og:title", content: "ViewRoyal.ai | Council Meeting Intelligence" },
    { property: "og:description", content: `AI-powered civic transparency platform for the ${municipalityName}.` },
    { property: "og:type", content: "website" },
    { property: "og:url", content: ogUrl("/") },
    { property: "og:image", content: ogImageUrl("Council Meeting Intelligence") },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
  ];
};

export async function loader({ request }: { request: Request }) {
  try {
    const { supabase } = createSupabaseServerClient(request);
    // getMunicipality call is intentionally duplicated from root loader.
    // The home loader needs rss_url at server time for getPublicNotices(),
    // and React Router 7 child loaders cannot access parent loader data on the server.
    const municipality = await getMunicipality(supabase);
    const [data, publicNotices] = await Promise.all([
      getHomeData(supabase),
      getPublicNotices((municipality as Municipality)?.rss_url),
    ]);

    return {
      upcomingMeeting: data.upcomingMeeting,
      recentMeeting: data.recentMeeting,
      recentMeetingStats: data.recentMeetingStats,
      recentMeetingDecisions: data.recentMeetingDecisions,
      activeMatters: data.activeMatters,
      recentDecisions: data.recentDecisions,
      publicNotices,
      municipality,
    };
  } catch (error) {
    console.error("Error loading home data:", error);
    throw new Response("Error loading dashboard", { status: 500 });
  }
}

export default function Home({ loaderData }: any) {
  const {
    upcomingMeeting,
    recentMeeting,
    recentMeetingStats,
    recentMeetingDecisions,
    activeMatters,
    recentDecisions,
    publicNotices,
    municipality,
  } = loaderData;

  const rootData = useRouteLoaderData("root") as
    | { user: any }
    | undefined;
  const user = rootData?.user;
  const shortName =
    (municipality as Municipality)?.short_name || "View Royal";

  return (
    <div className="min-h-screen bg-zinc-50">
      <HeroSection shortName={shortName} user={user} />

      <div className="container mx-auto py-12 px-4 max-w-6xl space-y-12">
        <UpcomingMeetingSection meeting={upcomingMeeting} />
        <RecentMeetingSection
          meeting={recentMeeting}
          stats={recentMeetingStats}
          decisions={recentMeetingDecisions}
        />
        <ActiveMattersSection matters={activeMatters} />
        <DecisionsFeedSection decisions={recentDecisions} />
        <PublicNoticesSection
          notices={publicNotices}
          websiteUrl={(municipality as Municipality)?.website_url}
        />
      </div>
    </div>
  );
}

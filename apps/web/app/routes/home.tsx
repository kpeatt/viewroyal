import { useRouteLoaderData } from "react-router";
import { getHomeData } from "../services/site";
import { createSupabaseServerClient } from "../lib/supabase.server";
import { getMunicipality } from "../services/municipality";
import type { Municipality } from "../lib/types";
import { HeroSection } from "../components/home/hero-section";
import { UpcomingMeetingSection } from "../components/home/upcoming-meeting-section";
import { RecentMeetingSection } from "../components/home/recent-meeting-section";
import { ActiveMattersSection } from "../components/home/active-matters-section";
import { DecisionsFeedSection } from "../components/home/decisions-feed-section";

export async function loader({ request }: { request: Request }) {
  try {
    const { supabase } = createSupabaseServerClient(request);
    const municipality = await getMunicipality(supabase);
    const data = await getHomeData(supabase);

    return {
      upcomingMeeting: data.upcomingMeeting,
      recentMeeting: data.recentMeeting,
      recentMeetingStats: data.recentMeetingStats,
      recentMeetingDecisions: data.recentMeetingDecisions,
      activeMatters: data.activeMatters,
      recentDecisions: data.recentDecisions,
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
      </div>
    </div>
  );
}

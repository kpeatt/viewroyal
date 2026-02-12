import { useState, useEffect, useCallback } from "react";
import * as meetingService from "../services/meetings";
import * as peopleService from "../services/people";
import * as orgService from "../services/organizations";
import * as matterService from "../services/matters";

import * as searchService from "../services/search";
import * as electionService from "../services/elections";
import * as siteService from "../services/site";
import * as analyticsService from "../services/analytics";

/**
 * A generic hook for fetching data from an API service function.
 * Useful for client-side interactions like searching or pagination.
 */
export function useQuery<T, Args extends any[]>(
  queryFn: (...args: Args) => Promise<T>,
  ...args: Args
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const result = await queryFn(...args);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [queryFn, JSON.stringify(args)]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

/**
 * Centralized API hook to access all data sources.
 */
export function useApi() {
  return {
    meetings: {
      list: meetingService.getMeetings,
      get: meetingService.getMeetingById,
      useList: (options?: meetingService.GetMeetingsOptions) =>
        useQuery(meetingService.getMeetings, options),
      useGet: (id: string) => useQuery(meetingService.getMeetingById, id),
    },
    people: {
      list: peopleService.getPeopleWithStats,
      get: peopleService.getPersonProfile,
      useList: () => useQuery(peopleService.getPeopleWithStats),
      useGet: (id: string) => useQuery(peopleService.getPersonProfile, id),
    },
    organizations: {
      list: orgService.getOrganizations,
      get: orgService.getOrganizationById,
      useList: () => useQuery(orgService.getOrganizations),
    },
    matters: {
      list: matterService.getMatters,
      get: matterService.getMatterById,
      getHotTopics: matterService.getHotTopics,
      useList: () => useQuery(matterService.getMatters),
      useGet: (id: string) => useQuery(matterService.getMatterById, id),
      useHotTopics: () => useQuery(matterService.getHotTopics),
    },

    search: {
      global: searchService.globalSearch,
      useGlobal: (q: string) => useQuery(searchService.globalSearch, q),
    },
    elections: {
      list: electionService.getElections,
      get: electionService.getElectionById,
      useList: () => useQuery(electionService.getElections),
      useGet: (id: string) => useQuery(electionService.getElectionById, id),
    },
    site: {
      getHomeData: siteService.getHomeData,
      useHomeData: () => useQuery(siteService.getHomeData),
    },
    analytics: {
      getVotingAlignment: analyticsService.getVotingAlignment,
      useVotingAlignment: () => useQuery(analyticsService.getVotingAlignment),
    },
    fiscal: {
      get: matterService.getFiscalData,
      useGet: () => useQuery(matterService.getFiscalData),
    },
    decisions: {
      getDivided: meetingService.getDividedDecisions,
      useDivided: () => useQuery(meetingService.getDividedDecisions),
    },
  };
}

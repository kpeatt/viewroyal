import { useMemo } from "react";
import type {
  TranscriptSegment,
  Attendance,
  Person,
  Membership,
} from "../lib/types";

interface SpeakerStats {
  stats: Record<string, number>;
  totalTime: number;
}

interface AttendanceGroups {
  council: ExtendedAttendance[];
  staff: ExtendedAttendance[];
  others: ExtendedAttendance[];
}

interface ExtendedAttendance {
  id: number | string;
  meeting_id?: number;
  person_id: number | null;
  attendance_mode?: string;
  notes?: string;
  created_at?: string;
  person?: Person;
  isVirtual?: boolean;
  resolvedName?: string;
}

interface UseSpeakerStatsOptions {
  transcript: TranscriptSegment[];
  attendance: Attendance[];
  speakerMap: Record<string, string>;
  meetingDate: string;
  resolveSpeakerName: (seg: {
    person?: { name: string } | null;
    speaker_name?: string | null;
  }) => string;
  activeCouncilMemberIds?: number[];
  people?: Record<number, Person>;
}

interface UseSpeakerStatsReturn {
  speakerStats: SpeakerStats;
  attendanceGroups: AttendanceGroups;
  getPersonRole: (person?: Person) => string | null;
  formatDuration: (seconds: number) => string;
}

export function useSpeakerStats({
  transcript,
  attendance,
  speakerMap,
  meetingDate,
  resolveSpeakerName,
  activeCouncilMemberIds = [],
  people = {},
}: UseSpeakerStatsOptions): UseSpeakerStatsReturn {
  const getPersonRole = (person?: Person): string | null => {
    if (!person) return null;
    const date = new Date(meetingDate);

    // 1. Try to find a membership that was specifically active during this meeting
    const activeMembership = person.memberships?.find((m: Membership) => {
      const start = m.start_date ? new Date(m.start_date) : new Date(0);
      const end = m.end_date ? new Date(m.end_date) : new Date(2100, 0, 1);
      return (
        date >= start &&
        date <= end &&
        m.organization?.classification === "Council"
      );
    });

    if (activeMembership) return activeMembership.role;

    // 2. Fallback: Use the most relevant membership role if it exists
    const fallback = person.memberships?.find(
      (m) =>
        m.organization?.classification === "Council" ||
        m.organization?.classification === "Staff",
    );

    return fallback?.role || (person.is_councillor ? "Councillor" : null);
  };

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  };

  // Calculate speaker statistics
  const speakerStats = useMemo(() => {
    const stats: Record<string, number> = {};
    let totalTime = 0;
    transcript.forEach((segment) => {
      const name = resolveSpeakerName(segment);
      const duration = segment.end_time - segment.start_time;
      stats[name] = (stats[name] || 0) + duration;
      totalTime += duration;
    });
    return { stats, totalTime };
  }, [transcript, resolveSpeakerName]);

  // Group attendance by role
  const attendanceGroups = useMemo(() => {
    const groups: AttendanceGroups = {
      council: [],
      staff: [],
      others: [],
    };

    const seenPersonIds = new Set<number>();
    const seenNames = new Set<string>();

    const isStaffMember = (person?: Person, roleLower: string = "") => {
      const hasStaffMembership = person?.memberships?.some(
        (m: Membership) =>
          m.organization?.classification === "Staff" ||
          m.role?.toLowerCase().includes("director") ||
          m.role?.toLowerCase().includes("clerk") ||
          m.role?.toLowerCase().includes("cao") ||
          m.role?.toLowerCase().includes("manager") ||
          m.role?.toLowerCase().includes("chief") ||
          m.role?.toLowerCase().includes("officer") ||
          m.role?.toLowerCase().includes("planner") ||
          m.role?.toLowerCase().includes("engineer") ||
          m.role?.toLowerCase().includes("administrator") ||
          m.role?.toLowerCase().includes("superintendent") ||
          m.role?.toLowerCase().includes("assistant") ||
          m.role?.toLowerCase().includes("deputy") ||
          m.role?.toLowerCase().includes("coordinator"),
      );

      return (
        hasStaffMembership ||
        roleLower.includes("director") ||
        roleLower.includes("clerk") ||
        roleLower.includes("cao") ||
        roleLower.includes("chief") ||
        roleLower.includes("officer") ||
        roleLower.includes("planner") ||
        roleLower.includes("engineer") ||
        roleLower.includes("administrator") ||
        roleLower.includes("superintendent") ||
        roleLower.includes("assistant") ||
        roleLower.includes("deputy") ||
        roleLower.includes("coordinator")
      );
    };

    // Process existing attendance records
    attendance.forEach((record) => {
      if (record.person_id) seenPersonIds.add(record.person_id);
      const name = record.person?.name || "Unknown";
      seenNames.add(name);

      const person = record.person ?? undefined;
      const role = getPersonRole(person);
      const roleLower = role?.toLowerCase() || "";

      // Strict check for ACTIVE council membership on this meeting date
      const meetingDateTime = new Date(meetingDate).getTime();
      const hasActiveCouncilMembership = person?.memberships?.some(
        (m: Membership) => {
          const start = m.start_date ? new Date(m.start_date).getTime() : 0;
          const end = m.end_date
            ? new Date(m.end_date).getTime()
            : 8640000000000000; // Max date

          const isCouncil =
            m.organization?.classification === "Council" ||
            m.role?.toLowerCase().includes("mayor") ||
            m.role?.toLowerCase().includes("councillor");

          return (
            isCouncil && meetingDateTime >= start && meetingDateTime <= end
          );
        },
      );

      const extendedRecord: ExtendedAttendance = {
        ...record,
        resolvedName: name,
      };

      if (hasActiveCouncilMembership) {
        groups.council.push(extendedRecord);
      } else if (isStaffMember(person, roleLower)) {
        groups.staff.push(extendedRecord);
      } else {
        // Only add to others if they are NOT Absent/Regrets
        if (
          record.attendance_mode !== "Absent" &&
          record.attendance_mode !== "Regrets"
        ) {
          groups.others.push(extendedRecord);
        }
      }
    });

    // Add active council members who are missing from attendance as "Regrets"
    activeCouncilMemberIds.forEach((id) => {
      if (!seenPersonIds.has(id)) {
        const person = people[id];
        if (person) {
          seenPersonIds.add(id);
          const name = person.name;
          seenNames.add(name);

          groups.council.push({
            id: `regrets-${id}` as any,
            person_id: id,
            person: person,
            attendance_mode: "Regrets",
            resolvedName: name,
          });
        }
      }
    });

    // Add virtual attendance for speakers not in attendance list
    transcript.forEach((segment) => {
      const name = resolveSpeakerName(segment);
      const personId = segment.person_id;

      if (personId && !seenPersonIds.has(personId)) {
        seenPersonIds.add(personId);
        seenNames.add(name);

        const virtualRecord: ExtendedAttendance = {
          id: `virtual-p-${personId}` as any,
          person_id: personId,
          person: segment.person,
          isVirtual: true,
          resolvedName: name,
        } as ExtendedAttendance;

        const role = getPersonRole(segment.person ?? undefined);
        const roleLower = role?.toLowerCase() || "";
        if (activeCouncilMemberIds.includes(personId)) {
          groups.council.push(virtualRecord);
        } else if (isStaffMember(segment.person ?? undefined, roleLower)) {
          groups.staff.push(virtualRecord);
        } else {
          groups.others.push(virtualRecord);
        }
      } else if (
        !personId &&
        !seenNames.has(name) &&
        name !== "Unknown Speaker"
      ) {
        seenNames.add(name);
        groups.others.push({
          id: `virtual-n-${name}`,
          person_id: null,
          isVirtual: true,
          resolvedName: name,
        });
      }
    });

    return groups;
  }, [
    attendance,
    transcript,
    meetingDate,
    resolveSpeakerName,
    activeCouncilMemberIds,
    people,
  ]);

  return {
    speakerStats,
    attendanceGroups,
    getPersonRole,
    formatDuration,
  };
}

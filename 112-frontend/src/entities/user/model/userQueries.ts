import type { QueryClient } from "@tanstack/react-query";

export const userKeys = {
  users: ["users"],
  user: ["user"],
  ownProfile: ["own-profile"],
  options: ["student-options"],
  members: ["group-members"],
  groupStudents: ["group-students"],
  telephonyStudents: ["telephony-students"],
  groups: ["groups"],
  groupOptions: ["group-options"],
  transferGroups: ["transfer-group-options"],
  activity: ["user-activity"],
  statistics: ["admin-summary"],
  photo: (id: string) => ["user-photo", id] as const,
} as const;

/** User records also appear in server projections owned by other screens. */
const identityViews = [
  ["student-profile"],
  ["student-overview"],
  ["lessons"],
  ["proctoring-monitor"],
  ["ai-jobs"],
] as const;

export function invalidateUser(client: QueryClient) {
  return Promise.all(
    [
      userKeys.users,
      userKeys.user,
      userKeys.ownProfile,
      userKeys.options,
      userKeys.members,
      userKeys.groupStudents,
      userKeys.telephonyStudents,
      userKeys.activity,
      userKeys.statistics,
      ...identityViews,
    ].map((queryKey) => client.invalidateQueries({ queryKey })),
  );
}

export function invalidateGroupMembers(client: QueryClient) {
  return Promise.all(
    [
      userKeys.groups,
      userKeys.groupOptions,
      userKeys.transferGroups,
      userKeys.members,
      userKeys.groupStudents,
      userKeys.users,
      userKeys.user,
      userKeys.ownProfile,
      ["student-profile"],
      ["student-overview"],
    ].map((queryKey) => client.invalidateQueries({ queryKey })),
  );
}

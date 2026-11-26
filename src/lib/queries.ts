import { useQuery } from "@tanstack/react-query";
import { team } from "./hub";
import { useIdentity } from "./identity";

/** Shared query keys so every view reads and invalidates the same cache entries. */
export const keys = {
  me: ["me"],
  office: ["moo"],
  resources: ["resources"],
  members: ["members"],
  invites: ["invites"],
  applications: ["applications"],
  status: ["hub-status"],
  relays: ["team-relays"],
  joinStatus: ["join-status"],
} as const;

export function useOffice() {
  const { user } = useIdentity();
  return useQuery({
    queryKey: keys.office,
    queryFn: team.office,
    enabled: !!user && user.role !== "follower",
    refetchInterval: 5000,
    retry: 1,
  });
}

export function useResources(enabled = true) {
  return useQuery({ queryKey: keys.resources, queryFn: team.resources, enabled });
}

export function useConnection() {
  return useQuery({ queryKey: keys.status, queryFn: team.status, refetchInterval: 5000 });
}

import { useQuery } from "@tanstack/react-query";
import { team } from "./hub";

/** Shared query keys so every core view reads and invalidates the same cache entries. */
export const keys = {
  me: ["me"],
  resources: ["resources"],
  members: ["members"],
  invites: ["invites"],
  applications: ["applications"],
  status: ["hub-status"],
  relays: ["team-relays"],
  joinStatus: ["join-status"],
} as const;

export function useResources(enabled = true) {
  return useQuery({ queryKey: keys.resources, queryFn: team.resources, enabled });
}

export function useConnection() {
  return useQuery({ queryKey: keys.status, queryFn: team.status, refetchInterval: 5000 });
}

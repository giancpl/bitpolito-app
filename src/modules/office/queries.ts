import { useQuery } from "@tanstack/react-query";
import { useIdentity } from "../../lib/identity";
import { officeApi } from "./api";

export const officeKeys = {
  state: ["moo"] as const,
};

export function useOffice() {
  const { user } = useIdentity();
  return useQuery({
    queryKey: officeKeys.state,
    queryFn: officeApi.state,
    enabled: !!user && user.role !== "follower",
    refetchInterval: 5000,
    retry: 1,
  });
}

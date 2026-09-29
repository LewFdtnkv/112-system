import { userKeys } from "@/entities/user";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { telephonyApi } from "@/entities/telephony";
import type { StationInput } from "@/entities/telephony";
import { userApi } from "@/entities/user";
export function useStations() {
  const client = useQueryClient();
  const stations = useQuery({
    queryKey: ["telephony-stations"],
    queryFn: ({ signal }) => telephonyApi.stations(signal),
    refetchInterval: 5000,
  });
  const students = useQuery({
    queryKey: userKeys.telephonyStudents,
    queryFn: ({ signal }) =>
      userApi.users({ role: "student", limit: 100 }, signal),
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["telephony-stations"] });
  const create = useMutation({
    mutationFn: (input: StationInput) => telephonyApi.createStation(input),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: ({
      id,
      student_id,
      enabled,
    }: {
      id: string;
      student_id: string | null;
      enabled: boolean;
    }) => telephonyApi.updateStation(id, { student_id, enabled }),
    onSuccess: refresh,
  });
  const credentials = useMutation({
    mutationFn: telephonyApi.credentials,
    gcTime: 0,
  });
  return { stations, students, create, update, credentials };
}

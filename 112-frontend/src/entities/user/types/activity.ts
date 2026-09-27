export interface Activity {
  id: string;
  occurred_at: string;
  kind: string;
  actor_id: string | null;
  reason: string;
}

type StageLike = { id: string; name: string };
type LeadLike = { stage_id: string | null };

/**
 * Sorts leads into the board's columns. A lead with no stage, or with a
 * stage this pipeline no longer has, goes in the "New" column (the first
 * column when there's no "New"), so no lead is ever missing from the board.
 */
export function groupLeadsByStage<S extends StageLike, L extends LeadLike>(
  stages: S[],
  leads: L[],
): Map<string, L[]> {
  const map = new Map<string, L[]>();
  for (const s of stages) map.set(s.id, []);
  const fallback = stages.find((s) => s.name === "New") ?? stages[0];
  for (const l of leads) {
    const column =
      l.stage_id && map.has(l.stage_id) ? map.get(l.stage_id) : fallback && map.get(fallback.id);
    column?.push(l);
  }
  return map;
}

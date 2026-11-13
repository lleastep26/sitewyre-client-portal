import { describe, expect, it } from "vitest";
import { groupLeadsByStage } from "@/lib/leads/board-columns";

const stages = [
  { id: "s_new", name: "New" },
  { id: "s_contacted", name: "Contacted" },
];

describe("groupLeadsByStage", () => {
  it("puts each lead in its own stage", () => {
    const map = groupLeadsByStage(stages, [
      { id: "a", stage_id: "s_new" },
      { id: "b", stage_id: "s_contacted" },
    ]);
    expect(map.get("s_new")?.map((l) => l.id)).toEqual(["a"]);
    expect(map.get("s_contacted")?.map((l) => l.id)).toEqual(["b"]);
  });

  it("shows a lead with no stage, or an unknown stage, in New", () => {
    const map = groupLeadsByStage(stages, [
      { id: "a", stage_id: null },
      { id: "b", stage_id: "deleted_stage" },
    ]);
    expect(map.get("s_new")?.map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("uses the first column when the pipeline has no New stage", () => {
    const map = groupLeadsByStage(
      [
        { id: "s1", name: "Inbox" },
        { id: "s2", name: "Quoted" },
      ],
      [{ id: "a", stage_id: null }],
    );
    expect(map.get("s1")?.map((l) => l.id)).toEqual(["a"]);
  });

  it("copes with a pipeline that has no stages", () => {
    expect(groupLeadsByStage([], [{ id: "a", stage_id: null }]).size).toBe(0);
  });
});

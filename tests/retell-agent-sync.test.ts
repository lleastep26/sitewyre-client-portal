import { beforeEach, describe, expect, it, vi } from "vitest";

const createRetellAgent = vi.fn();
const updateRetellAgentPrompt = vi.fn();

vi.mock("@/lib/integrations/retell", () => ({
  createRetellAgent,
  updateRetellAgentPrompt,
}));

let fakeClientRow: Record<string, unknown> | null;
let clientUpdates: Record<string, unknown>[];

function fakeSupabase() {
  return {
    from(table: string) {
      if (table === "clients") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: fakeClientRow }),
              maybeSingle: async () => ({ data: fakeClientRow }),
            }),
          }),
          update: (patch: Record<string, unknown>) => {
            clientUpdates.push(patch);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === "services" || table === "availability" || table === "client_faqs") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ data: [] }),
              order: () => ({ data: [] }),
              data: [],
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clientUpdates = [];
  fakeClientRow = {
    business_name: "Acme Plumbing",
    trade: "plumbing",
    service_area: null,
    services_offered: null,
    after_hours_rules: null,
    ai_never_say: null,
    retell_llm_id: null,
    retell_agent_id: null,
  };
});

describe("syncRetellAgent", () => {
  it("creates a new agent when the client has none yet, and saves the ids", async () => {
    createRetellAgent.mockResolvedValue({ llmId: "llm_1", agentId: "agent_1" });
    const { syncRetellAgent } = await import("@/lib/retell/agent-sync");
    const result = await syncRetellAgent(fakeSupabase() as never, "client1");
    expect(result).toEqual({ ok: true });
    expect(createRetellAgent).toHaveBeenCalledTimes(1);
    expect(updateRetellAgentPrompt).not.toHaveBeenCalled();
    expect(clientUpdates).toContainEqual({ retell_llm_id: "llm_1", retell_agent_id: "agent_1" });
  });

  it("updates the existing agent's prompt instead of creating a new one", async () => {
    fakeClientRow = { ...fakeClientRow, retell_llm_id: "llm_existing", retell_agent_id: "agent_existing" };
    const { syncRetellAgent } = await import("@/lib/retell/agent-sync");
    const result = await syncRetellAgent(fakeSupabase() as never, "client1");
    expect(result).toEqual({ ok: true });
    expect(updateRetellAgentPrompt).toHaveBeenCalledWith(
      "llm_existing",
      expect.stringContaining("Acme Plumbing"),
      expect.stringContaining("Acme Plumbing"),
    );
    expect(createRetellAgent).not.toHaveBeenCalled();
  });

  it("errors when the client doesn't exist", async () => {
    fakeClientRow = null;
    const { syncRetellAgent } = await import("@/lib/retell/agent-sync");
    const result = await syncRetellAgent(fakeSupabase() as never, "client1");
    expect(result).toEqual({ error: "Client not found." });
  });
});

describe("pushBusinessKnowledgeToRetell", () => {
  it("no-ops when the client has never enabled the AI receptionist", async () => {
    const { pushBusinessKnowledgeToRetell } = await import("@/lib/retell/agent-sync");
    await pushBusinessKnowledgeToRetell(fakeSupabase() as never, "client1");
    expect(updateRetellAgentPrompt).not.toHaveBeenCalled();
    expect(createRetellAgent).not.toHaveBeenCalled();
  });

  it("pushes an update when an agent already exists", async () => {
    fakeClientRow = { ...fakeClientRow, retell_llm_id: "llm_existing", retell_agent_id: "agent_existing" };
    const { pushBusinessKnowledgeToRetell } = await import("@/lib/retell/agent-sync");
    await pushBusinessKnowledgeToRetell(fakeSupabase() as never, "client1");
    expect(updateRetellAgentPrompt).toHaveBeenCalledTimes(1);
  });

  it("swallows errors from the push instead of throwing", async () => {
    fakeClientRow = { ...fakeClientRow, retell_llm_id: "llm_existing", retell_agent_id: "agent_existing" };
    updateRetellAgentPrompt.mockRejectedValue(new Error("Retell is down"));
    const { pushBusinessKnowledgeToRetell } = await import("@/lib/retell/agent-sync");
    await expect(pushBusinessKnowledgeToRetell(fakeSupabase() as never, "client1")).resolves.toBeUndefined();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectCall = vi.fn();

vi.mock("@/lib/adapters", () => ({ getVoiceProvider: () => ({ redirectCall }) }));

function formRequest(path: string, fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return new Request(`http://localhost${path}`, { method: "POST", body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  redirectCall.mockResolvedValue(undefined);
});

describe("POST /api/retell/emergency-transfer-status", () => {
  it("redirects the caller's live call into the conference once the owner answers", async () => {
    const { POST } = await import("@/app/api/retell/emergency-transfer-status/route");
    const res = await POST(
      formRequest(
        "/api/retell/emergency-transfer-status?originalCallSid=CAcaller&conference=emergency-call1",
        { CallStatus: "in-progress" },
      ),
    );
    expect(res.status).toBe(200);
    expect(redirectCall).toHaveBeenCalledWith("CAcaller", expect.stringContaining("emergency-call1"));
  });

  it("does nothing when the owner's call wasn't answered", async () => {
    const { POST } = await import("@/app/api/retell/emergency-transfer-status/route");
    await POST(
      formRequest(
        "/api/retell/emergency-transfer-status?originalCallSid=CAcaller&conference=emergency-call1",
        { CallStatus: "no-answer" },
      ),
    );
    expect(redirectCall).not.toHaveBeenCalled();
  });

  it("does nothing on completion either", async () => {
    const { POST } = await import("@/app/api/retell/emergency-transfer-status/route");
    await POST(
      formRequest(
        "/api/retell/emergency-transfer-status?originalCallSid=CAcaller&conference=emergency-call1",
        { CallStatus: "completed" },
      ),
    );
    expect(redirectCall).not.toHaveBeenCalled();
  });
});

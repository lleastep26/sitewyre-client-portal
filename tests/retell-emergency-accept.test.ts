import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectCall = vi.fn();

vi.mock("@/lib/adapters", () => ({ getVoiceProvider: () => ({ redirectCall }) }));

const PATH = "/api/retell/emergency-accept?originalCallSid=CAcaller&conference=emergency-call1";

function formRequest(path: string, fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return new Request(`http://localhost${path}`, { method: "POST", body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  redirectCall.mockResolvedValue(undefined);
});

describe("POST /api/retell/emergency-accept", () => {
  it("on 1, pulls the caller into the conference and puts the owner in it", async () => {
    const { POST } = await import("@/app/api/retell/emergency-accept/route");
    const res = await POST(formRequest(PATH, { Digits: "1" }));
    const body = await res.text();

    expect(redirectCall).toHaveBeenCalledTimes(1);
    expect(redirectCall).toHaveBeenCalledWith("CAcaller", expect.stringContaining("emergency-call1"));
    expect(body).toContain('<Conference endConferenceOnExit="true">emergency-call1</Conference>');
  });

  it("on any other digit, hangs up the owner's leg and leaves the caller with the AI", async () => {
    const { POST } = await import("@/app/api/retell/emergency-accept/route");
    const res = await POST(formRequest(PATH, { Digits: "9" }));

    expect(await res.text()).toBe("<Response><Hangup/></Response>");
    expect(redirectCall).not.toHaveBeenCalled();
  });

  it("with no digit at all, leaves the caller with the AI", async () => {
    const { POST } = await import("@/app/api/retell/emergency-accept/route");
    const res = await POST(formRequest(PATH, {}));

    expect(await res.text()).toBe("<Response><Hangup/></Response>");
    expect(redirectCall).not.toHaveBeenCalled();
  });

  it("tells the owner when the caller has already hung up", async () => {
    redirectCall.mockRejectedValue(new Error("call is not in-progress"));
    const { POST } = await import("@/app/api/retell/emergency-accept/route");
    const body = await (await POST(formRequest(PATH, { Digits: "1" }))).text();

    expect(body).toContain("no longer on the line");
    expect(body).not.toContain("<Conference");
  });
});

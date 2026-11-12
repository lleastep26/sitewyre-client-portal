import { beforeEach, describe, expect, it, vi } from "vitest";

let fakeSupabase: unknown;
let fakeClient: Record<string, unknown>;
let fakeRole: string;

const checkWebsiteReachable = vi.fn();
const encryptEin = vi.fn();
const decryptEin = vi.fn();
const einLast4 = vi.fn();
const advanceA2pPipeline = vi.fn();
const resendBrandOtp = vi.fn();
const getSitewyrePrimaryBrandSid = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireMembership: async () => ({ supabase: fakeSupabase, client: fakeClient, role: fakeRole }),
}));
vi.mock("@/lib/a2p/website-check", () => ({
  checkWebsiteReachable: (url: string) => checkWebsiteReachable(url),
}));
vi.mock("@/lib/a2p/encryption", () => ({
  encryptEin: (v: string) => encryptEin(v),
  decryptEin: (v: string) => decryptEin(v),
  einLast4: (v: string) => einLast4(v),
}));
vi.mock("@/lib/a2p/pipeline", async () => {
  const actual = await vi.importActual<typeof import("@/lib/a2p/pipeline")>("@/lib/a2p/pipeline");
  return {
    ...actual,
    advanceA2pPipeline: (...args: unknown[]) => advanceA2pPipeline(...args),
  };
});
vi.mock("@/lib/a2p/trust-hub", () => ({
  resendBrandOtp: (sid: string) => resendBrandOtp(sid),
  getSitewyrePrimaryBrandSid: () => getSitewyrePrimaryBrandSid(),
}));

function makeClientsTable(onUpdate: (patch: unknown) => void) {
  const chain = {
    update(patch: unknown) {
      onUpdate(patch);
      return chain;
    },
    eq: () => chain,
    then(resolve: (v: { error: null }) => void) {
      resolve({ error: null });
    },
  };
  return chain;
}

function fd(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeClient = {
    id: "client1",
    website: "https://acme.com",
    legal_business_name: "Acme Cleaning",
    business_name: "Acme Cleaning",
    business_email: "owner@acme.com",
    phone: "+15125550123",
    address_line1: "123 Main St",
    city: "Austin",
    state: "TX",
    postal_code: "78701",
    country: "US",
    owner_name: "Jane Doe",
    twilio_phone_sid: "PN123",
    a2p_registration_type: null,
    a2p_ein_encrypted: null,
    a2p_pipeline: {},
  };
  fakeRole = "owner";
  checkWebsiteReachable.mockResolvedValue(true);
  encryptEin.mockImplementation((v: string) => `enc(${v})`);
  einLast4.mockImplementation((v: string) => v.slice(-4));
  advanceA2pPipeline.mockResolvedValue({
    state: { stage: "trust_bundle", error: null, customerProfileSid: "BU1" },
    a2pStatus: "pending",
  });
  getSitewyrePrimaryBrandSid.mockResolvedValue("BNprimarybrand");
});

describe("startA2pRegistration", () => {
  it("blocks office from starting registration", async () => {
    fakeRole = "office";
    fakeSupabase = { from: () => makeClientsTable(() => undefined) };
    const { startA2pRegistration } = await import("@/app/(app)/settings/a2p-actions");
    const result = await startA2pRegistration(fd({ registrationType: "sole_prop" }));
    expect(result).toEqual({ error: expect.stringContaining("owner or a Sitewyre admin") });
  });

  it("blocks when the website isn't set", async () => {
    fakeClient.website = null;
    fakeSupabase = { from: () => makeClientsTable(() => undefined) };
    const { startA2pRegistration } = await import("@/app/(app)/settings/a2p-actions");
    const result = await startA2pRegistration(
      fd({ registrationType: "sole_prop", confirmPrivacyPolicy: "on", confirmLeadFormConsent: "on" }),
    );
    expect(result).toEqual({ error: expect.stringContaining("Add your website URL") });
  });

  it("blocks when the checklist isn't fully confirmed", async () => {
    fakeSupabase = { from: () => makeClientsTable(() => undefined) };
    const { startA2pRegistration } = await import("@/app/(app)/settings/a2p-actions");
    const result = await startA2pRegistration(
      fd({ registrationType: "sole_prop", confirmPrivacyPolicy: "on" }),
    );
    expect(result).toEqual({ error: expect.stringContaining("Confirm both checklist items") });
    expect(checkWebsiteReachable).not.toHaveBeenCalled();
  });

  it("blocks when the live website check fails", async () => {
    checkWebsiteReachable.mockResolvedValue(false);
    fakeSupabase = { from: () => makeClientsTable(() => undefined) };
    const { startA2pRegistration } = await import("@/app/(app)/settings/a2p-actions");
    const result = await startA2pRegistration(
      fd({ registrationType: "sole_prop", confirmPrivacyPolicy: "on", confirmLeadFormConsent: "on" }),
    );
    expect(result).toEqual({ error: expect.stringContaining("didn't load") });
  });

  it("rejects an invalid EIN for the low_volume_standard path", async () => {
    fakeSupabase = { from: () => makeClientsTable(() => undefined) };
    const { startA2pRegistration } = await import("@/app/(app)/settings/a2p-actions");
    const result = await startA2pRegistration(
      fd({
        registrationType: "low_volume_standard",
        confirmPrivacyPolicy: "on",
        confirmLeadFormConsent: "on",
        ein: "not-an-ein",
      }),
    );
    expect(result).toEqual({ error: expect.stringContaining("valid 9-digit EIN") });
    expect(encryptEin).not.toHaveBeenCalled();
  });

  it("encrypts the EIN and saves last4 for the low_volume_standard path", async () => {
    const updates: Record<string, unknown>[] = [];
    fakeSupabase = { from: () => makeClientsTable((p) => updates.push(p as Record<string, unknown>)) };
    const { startA2pRegistration } = await import("@/app/(app)/settings/a2p-actions");
    const result = await startA2pRegistration(
      fd({
        registrationType: "low_volume_standard",
        confirmPrivacyPolicy: "on",
        confirmLeadFormConsent: "on",
        ein: "12-3456789",
      }),
    );
    expect(result).toEqual({ ok: true });
    expect(encryptEin).toHaveBeenCalledWith("123456789");
    expect(updates[0]).toMatchObject({
      a2p_registration_type: "low_volume_standard",
      a2p_ein_encrypted: "enc(123456789)",
      a2p_ein_last4: "6789",
    });
  });

  it("kicks off the pipeline and saves its resulting state for the sole_prop path", async () => {
    const updates: Record<string, unknown>[] = [];
    fakeSupabase = { from: () => makeClientsTable((p) => updates.push(p as Record<string, unknown>)) };
    const { startA2pRegistration } = await import("@/app/(app)/settings/a2p-actions");
    const result = await startA2pRegistration(
      fd({ registrationType: "sole_prop", confirmPrivacyPolicy: "on", confirmLeadFormConsent: "on" }),
    );
    expect(result).toEqual({ ok: true });
    expect(advanceA2pPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ registrationType: "sole_prop" }),
      "PN123",
      expect.objectContaining({ stage: "customer_profile" }),
    );
    expect(updates[0]).toMatchObject({
      a2p_pipeline: { stage: "trust_bundle", error: null, customerProfileSid: "BU1" },
      a2p_status: "pending",
    });
  });

  it("blocks the owner from using the same_entity path — admin only", async () => {
    fakeRole = "owner";
    fakeSupabase = { from: () => makeClientsTable(() => undefined) };
    const { startA2pRegistration } = await import("@/app/(app)/settings/a2p-actions");
    const result = await startA2pRegistration(
      fd({ registrationType: "same_entity", confirmPrivacyPolicy: "on", confirmLeadFormConsent: "on" }),
    );
    expect(result).toEqual({ error: expect.stringContaining("Sitewyre admin") });
    expect(getSitewyrePrimaryBrandSid).not.toHaveBeenCalled();
  });

  it("resolves Sitewyre's brand and seeds the pipeline at messaging_service for same_entity, with no EIN", async () => {
    fakeRole = "sitewyre_admin";
    const updates: Record<string, unknown>[] = [];
    fakeSupabase = { from: () => makeClientsTable((p) => updates.push(p as Record<string, unknown>)) };
    const { startA2pRegistration } = await import("@/app/(app)/settings/a2p-actions");
    const result = await startA2pRegistration(
      fd({ registrationType: "same_entity", confirmPrivacyPolicy: "on", confirmLeadFormConsent: "on" }),
    );
    expect(result).toEqual({ ok: true });
    expect(getSitewyrePrimaryBrandSid).toHaveBeenCalled();
    expect(advanceA2pPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ registrationType: "same_entity" }),
      "PN123",
      expect.objectContaining({ stage: "messaging_service", brandSid: "BNprimarybrand" }),
    );
    expect(encryptEin).not.toHaveBeenCalled();
    expect(updates[0]).not.toHaveProperty("a2p_ein_encrypted");
  });
});

describe("advanceA2pRegistration", () => {
  it("blocks crew", async () => {
    fakeRole = "crew";
    fakeClient.a2p_registration_type = "sole_prop";
    fakeSupabase = { from: () => makeClientsTable(() => undefined) };
    const { advanceA2pRegistration } = await import("@/app/(app)/settings/a2p-actions");
    const result = await advanceA2pRegistration();
    expect(result).toEqual({ error: expect.stringContaining("owner or a Sitewyre admin") });
  });

  it("errors when no registration is in progress", async () => {
    fakeSupabase = { from: () => makeClientsTable(() => undefined) };
    const { advanceA2pRegistration } = await import("@/app/(app)/settings/a2p-actions");
    const result = await advanceA2pRegistration();
    expect(result).toEqual({ error: "No registration in progress" });
  });

  it("decrypts the EIN before building business info", async () => {
    fakeClient.a2p_registration_type = "low_volume_standard";
    fakeClient.a2p_ein_encrypted = "enc(123456789)";
    fakeClient.a2p_pipeline = { stage: "brand", error: null };
    decryptEin.mockReturnValue("123456789");
    fakeSupabase = { from: () => makeClientsTable(() => undefined) };
    const { advanceA2pRegistration } = await import("@/app/(app)/settings/a2p-actions");
    await advanceA2pRegistration();
    expect(decryptEin).toHaveBeenCalledWith("enc(123456789)");
    expect(advanceA2pPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ ein: "123456789" }),
      "PN123",
      expect.objectContaining({ stage: "brand" }),
    );
  });

  it("saves the advanced state and status", async () => {
    fakeClient.a2p_registration_type = "sole_prop";
    fakeClient.a2p_pipeline = { stage: "customer_profile", error: null };
    advanceA2pPipeline.mockResolvedValue({
      state: { stage: "trust_bundle", error: null },
      a2pStatus: "pending",
    });
    const updates: Record<string, unknown>[] = [];
    fakeSupabase = { from: () => makeClientsTable((p) => updates.push(p as Record<string, unknown>)) };
    const { advanceA2pRegistration } = await import("@/app/(app)/settings/a2p-actions");
    const result = await advanceA2pRegistration();
    expect(result).toEqual({ ok: true });
    expect(updates[0]).toEqual({
      a2p_pipeline: { stage: "trust_bundle", error: null },
      a2p_status: "pending",
    });
  });
});

describe("retryA2pStage", () => {
  it("blocks office", async () => {
    fakeRole = "office";
    fakeSupabase = { from: () => makeClientsTable(() => undefined) };
    const { retryA2pStage } = await import("@/app/(app)/settings/a2p-actions");
    const result = await retryA2pStage();
    expect(result).toEqual({ error: expect.stringContaining("owner or a Sitewyre admin") });
  });

  it("clears the rejected stage and resets status to pending", async () => {
    fakeClient.a2p_pipeline = { stage: "otp_pending", error: "Bad name", brandSid: "BN1" };
    const updates: Record<string, unknown>[] = [];
    fakeSupabase = { from: () => makeClientsTable((p) => updates.push(p as Record<string, unknown>)) };
    const { retryA2pStage } = await import("@/app/(app)/settings/a2p-actions");
    const result = await retryA2pStage();
    expect(result).toEqual({ ok: true });
    expect(updates[0]).toMatchObject({ a2p_status: "pending" });
    const pipeline = updates[0].a2p_pipeline as Record<string, unknown>;
    expect(pipeline.stage).toBe("brand");
    expect(pipeline.brandSid).toBeUndefined();
  });
});

describe("resendA2pOtp", () => {
  it("blocks office", async () => {
    fakeRole = "office";
    fakeSupabase = { from: () => makeClientsTable(() => undefined) };
    const { resendA2pOtp } = await import("@/app/(app)/settings/a2p-actions");
    const result = await resendA2pOtp();
    expect(result).toEqual({ error: expect.stringContaining("owner or a Sitewyre admin") });
  });

  it("errors when there's no brand yet", async () => {
    fakeClient.a2p_pipeline = { stage: "brand", error: null };
    fakeSupabase = { from: () => makeClientsTable(() => undefined) };
    const { resendA2pOtp } = await import("@/app/(app)/settings/a2p-actions");
    const result = await resendA2pOtp();
    expect(result).toEqual({ error: "No brand registration in progress" });
  });

  it("resends via the brand's OTP sub-resource", async () => {
    fakeClient.a2p_pipeline = { stage: "otp_pending", error: null, brandSid: "BN1" };
    fakeSupabase = { from: () => makeClientsTable(() => undefined) };
    const { resendA2pOtp } = await import("@/app/(app)/settings/a2p-actions");
    const result = await resendA2pOtp();
    expect(result).toEqual({ ok: true });
    expect(resendBrandOtp).toHaveBeenCalledWith("BN1");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

let fakeSupabase: unknown;
let fakeClient: {
  id: string;
  email_domain: string | null;
  email_domain_resend_id: string | null;
};
let fakeRole: string;

const createEmailDomain = vi.fn();
const refreshEmailDomain = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireMembership: async () => ({ supabase: fakeSupabase, client: fakeClient, role: fakeRole }),
}));
vi.mock("@/lib/email/resend-domains", () => ({
  createEmailDomain: (domain: string) => createEmailDomain(domain),
  refreshEmailDomain: (id: string, domain: string) => refreshEmailDomain(id, domain),
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
  fakeClient = { id: "client1", email_domain: null, email_domain_resend_id: null };
  fakeRole = "owner";
});

describe("createClientEmailDomain", () => {
  it("blocks office from setting up email", async () => {
    fakeRole = "office";
    const updates: unknown[] = [];
    fakeSupabase = { from: () => makeClientsTable((p) => updates.push(p)) };
    const { createClientEmailDomain } = await import("@/app/(app)/settings/email-actions");
    const result = await createClientEmailDomain(fd({ domain: "mail.example.com" }));
    expect(result).toEqual({ error: expect.stringContaining("owner or a Sitewyre admin") });
    expect(createEmailDomain).not.toHaveBeenCalled();
  });

  it("rejects an invalid domain", async () => {
    fakeSupabase = { from: () => makeClientsTable(() => undefined) };
    const { createClientEmailDomain } = await import("@/app/(app)/settings/email-actions");
    const result = await createClientEmailDomain(fd({ domain: "not a domain" }));
    expect(result).toEqual({ error: expect.stringContaining("valid domain") });
    expect(createEmailDomain).not.toHaveBeenCalled();
  });

  it("blocks when a domain is already set up", async () => {
    fakeClient.email_domain = "mail.existing.com";
    fakeSupabase = { from: () => makeClientsTable(() => undefined) };
    const { createClientEmailDomain } = await import("@/app/(app)/settings/email-actions");
    const result = await createClientEmailDomain(fd({ domain: "mail.example.com" }));
    expect(result).toEqual({ error: expect.stringContaining("already set up") });
    expect(createEmailDomain).not.toHaveBeenCalled();
  });

  it("creates the domain and saves the Resend result", async () => {
    createEmailDomain.mockResolvedValue({
      id: "dom_1",
      status: "pending",
      records: [{ record: "SPF" }],
    });
    const updates: unknown[] = [];
    fakeSupabase = { from: () => makeClientsTable((p) => updates.push(p)) };
    const { createClientEmailDomain } = await import("@/app/(app)/settings/email-actions");
    const result = await createClientEmailDomain(fd({ domain: "mail.example.com" }));
    expect(result).toEqual({ ok: true });
    expect(createEmailDomain).toHaveBeenCalledWith("mail.example.com");
    expect(updates[0]).toMatchObject({
      email_domain: "mail.example.com",
      email_domain_resend_id: "dom_1",
      email_domain_status: "pending",
    });
  });
});

describe("verifyClientEmailDomain", () => {
  it("errors when no domain is set up yet", async () => {
    fakeSupabase = { from: () => makeClientsTable(() => undefined) };
    const { verifyClientEmailDomain } = await import("@/app/(app)/settings/email-actions");
    const result = await verifyClientEmailDomain();
    expect(result).toEqual({ error: expect.stringContaining("No sending domain") });
  });

  it("refreshes and saves the fresh status and records", async () => {
    fakeClient.email_domain = "mail.example.com";
    fakeClient.email_domain_resend_id = "dom_1";
    refreshEmailDomain.mockResolvedValue({ status: "verified", records: [{ record: "SPF" }] });
    const updates: unknown[] = [];
    fakeSupabase = { from: () => makeClientsTable((p) => updates.push(p)) };
    const { verifyClientEmailDomain } = await import("@/app/(app)/settings/email-actions");
    const result = await verifyClientEmailDomain();
    expect(result).toMatchObject({ ok: true, status: "verified" });
    expect(updates[0]).toMatchObject({ email_domain_status: "verified" });
  });
});

describe("updateEmailSenderSettings", () => {
  it("rejects an invalid reply-to address", async () => {
    fakeSupabase = { from: () => makeClientsTable(() => undefined) };
    const { updateEmailSenderSettings } = await import("@/app/(app)/settings/email-actions");
    const result = await updateEmailSenderSettings(
      fd({ email_from_name: "Acme", email_reply_to: "not-an-email" }),
    );
    expect(result).toEqual({ error: expect.stringContaining("valid reply-to") });
  });

  it("saves from-name and reply-to", async () => {
    const updates: unknown[] = [];
    fakeSupabase = { from: () => makeClientsTable((p) => updates.push(p)) };
    const { updateEmailSenderSettings } = await import("@/app/(app)/settings/email-actions");
    const result = await updateEmailSenderSettings(
      fd({ email_from_name: "Acme Support", email_reply_to: "support@acme.com" }),
    );
    expect(result).toEqual({ ok: true });
    expect(updates[0]).toEqual({
      email_from_name: "Acme Support",
      email_reply_to: "support@acme.com",
    });
  });
});

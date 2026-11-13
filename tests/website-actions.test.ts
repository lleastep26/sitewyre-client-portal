import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
let fakeClient: Row;
let fakeRole: string;
let updates: Row[];
let audit: Row[];
let domainTakenBy: string | null;
let lastDomainChecked: string | null;

const memberSupabase = {
  from(table: string) {
    if (table === "clients") {
      return {
        update: (patch: Row) => {
          updates.push(patch);
          return { eq: async () => ({ error: null }) };
        },
      };
    }
    if (table === "audit_log") {
      return { insert: async (row: Row) => (audit.push(row), { error: null }) };
    }
    throw new Error(`unexpected table ${table}`);
  },
};
const adminSupabase = {
  from: () => ({
    select: () => ({
      eq: (_col: string, value: string) => {
        lastDomainChecked = value;
        return { neq: () => ({ limit: async () => ({ data: domainTakenBy ? [{ id: domainTakenBy }] : [] }) }) };
      },
    }),
  }),
};

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireMembership: async () => ({ supabase: memberSupabase, client: fakeClient, role: fakeRole, user: { id: "user1" } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminSupabase }));

function fd(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeClient = { id: "client1", domain: null, live_site_url: null };
  fakeRole = "owner";
  updates = [];
  audit = [];
  domainTakenBy = null;
  lastDomainChecked = null;
});

describe("setWebsiteDomain", () => {
  it("lets the owner save their own website, cleaned up", async () => {
    const { setWebsiteDomain } = await import("@/app/(app)/settings/website-actions");
    expect(await setWebsiteDomain(fd({ domain: "https://www.Acme-Plumbing.com/contact" }))).toEqual({ ok: true });
    expect(lastDomainChecked).toBe("acme-plumbing.com");
    expect(updates).toEqual([{ domain: "acme-plumbing.com" }]);
  });

  it("refuses a website that belongs to another business", async () => {
    domainTakenBy = "client2";
    const { setWebsiteDomain } = await import("@/app/(app)/settings/website-actions");
    expect(await setWebsiteDomain(fd({ domain: "acme-plumbing.com" }))).toEqual({
      error: expect.stringContaining("already connected to another Sitewyre account"),
    });
    expect(updates).toEqual([]);
  });

  it("refuses something that isn't a website address", async () => {
    const { setWebsiteDomain } = await import("@/app/(app)/settings/website-actions");
    for (const bad of ["", "not a site", "localhost", "acme"]) {
      expect(await setWebsiteDomain(fd({ domain: bad }))).toEqual({ error: expect.stringContaining("website address") });
    }
    expect(updates).toEqual([]);
  });

  it("blocks office and crew", async () => {
    fakeRole = "office";
    const { setWebsiteDomain } = await import("@/app/(app)/settings/website-actions");
    expect(await setWebsiteDomain(fd({ domain: "acme-plumbing.com" }))).toEqual({
      error: expect.stringContaining("owner or a Sitewyre admin"),
    });
  });
});

describe("setFormCapture", () => {
  it("needs a saved website before it can be turned on", async () => {
    const { setFormCapture } = await import("@/app/(app)/settings/website-actions");
    expect(await setFormCapture(fd({ enabled: "true" }))).toEqual({ error: "Save your website address first." });
    expect(updates).toEqual([]);
  });

  it("turns on and off", async () => {
    fakeClient.domain = "acme-plumbing.com";
    const { setFormCapture } = await import("@/app/(app)/settings/website-actions");
    expect(await setFormCapture(fd({ enabled: "true" }))).toEqual({ ok: true });
    expect(await setFormCapture(fd({ enabled: "false" }))).toEqual({ ok: true });
    expect(updates).toEqual([{ form_capture_enabled: true }, { form_capture_enabled: false }]);
  });
});

describe("setWebsiteConsentConfirmed", () => {
  it("records when consent was confirmed and by whom", async () => {
    const { setWebsiteConsentConfirmed } = await import("@/app/(app)/settings/website-actions");
    expect(await setWebsiteConsentConfirmed(fd({ confirmed: "true" }))).toEqual({ ok: true });
    expect(updates).toEqual([{ website_consent_confirmed_at: expect.any(String) }]);
    expect(audit).toEqual([
      expect.objectContaining({ actor_id: "user1", action: "website_sms_consent_confirmed", client_id: "client1" }),
    ]);
  });

  it("clears it again when unticked", async () => {
    const { setWebsiteConsentConfirmed } = await import("@/app/(app)/settings/website-actions");
    await setWebsiteConsentConfirmed(fd({ confirmed: "false" }));
    expect(updates).toEqual([{ website_consent_confirmed_at: null }]);
    expect(audit[0]).toMatchObject({ action: "website_sms_consent_withdrawn" });
  });

  it("blocks crew", async () => {
    fakeRole = "crew";
    const { setWebsiteConsentConfirmed } = await import("@/app/(app)/settings/website-actions");
    expect(await setWebsiteConsentConfirmed(fd({ confirmed: "true" }))).toEqual({
      error: expect.stringContaining("owner or a Sitewyre admin"),
    });
    expect(updates).toEqual([]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

let fakeSupabase: unknown;
let fakeAdminSupabase: unknown;
let fakeClientRow: { id: string; agency_id: string } | null;
let fakeIsSitewyreAdmin: boolean;
let fakeAgencyId: string | null;
let cookieStore: Map<string, string>;
let domainTaken: boolean;

const createClientAccount = vi.fn();

class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`REDIRECT:${url}`);
  }
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined,
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  requireAdmin: async () => ({ supabase: fakeSupabase, user: { id: "admin1" } }),
  requireAgencyOrSitewyreAdmin: async () => ({
    supabase: fakeSupabase,
    user: { id: "admin1" },
    isSitewyreAdmin: fakeIsSitewyreAdmin,
    agencyId: fakeAgencyId,
  }),
  ADMIN_VIEW_COOKIE: "admin_view_client_id",
}));
vi.mock("@/lib/accounts/create-client", () => ({ createClientAccount }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => fakeAdminSupabase,
}));

function fd(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}

function buildSupabase() {
  return {
    from(table: string) {
      if (table === "clients") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({ data: fakeClientRow }),
          limit: async () => ({ data: domainTaken ? [{ id: "other-client" }] : [] }),
          update() {
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === "audit_log") {
        return { insert: async () => ({ error: null }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieStore = new Map();
  domainTaken = false;
  fakeIsSitewyreAdmin = true;
  fakeAgencyId = null;
  fakeClientRow = { id: "client1", agency_id: "agency1" };
  fakeSupabase = buildSupabase();
  fakeAdminSupabase = buildSupabase();
});

describe("switchAdminViewClient", () => {
  it("lets a sitewyre_admin view-as any client", async () => {
    const { switchAdminViewClient } = await import("@/app/admin/actions");
    await expect(switchAdminViewClient(fd({ clientId: "client1" }))).rejects.toThrow(
      "REDIRECT:/",
    );
    expect(cookieStore.get("admin_view_client_id")).toBe("client1");
  });

  it("lets an agency_admin view-as a client in their own agency", async () => {
    fakeIsSitewyreAdmin = false;
    fakeAgencyId = "agency1";
    const { switchAdminViewClient } = await import("@/app/admin/actions");
    await expect(switchAdminViewClient(fd({ clientId: "client1" }))).rejects.toThrow(
      "REDIRECT:/",
    );
    expect(cookieStore.get("admin_view_client_id")).toBe("client1");
  });

  it("blocks an agency_admin from viewing-as a client in another agency", async () => {
    fakeIsSitewyreAdmin = false;
    fakeAgencyId = "some-other-agency";
    const { switchAdminViewClient } = await import("@/app/admin/actions");
    await expect(switchAdminViewClient(fd({ clientId: "client1" }))).rejects.toThrow(
      "REDIRECT:/admin",
    );
    expect(cookieStore.has("admin_view_client_id")).toBe(false);
  });
});

describe("setClientCallRouting", () => {
  it("blocks an agency_admin from editing a client in another agency", async () => {
    fakeIsSitewyreAdmin = false;
    fakeAgencyId = "some-other-agency";
    const { setClientCallRouting } = await import("@/app/admin/actions");
    const result = await setClientCallRouting(
      fd({ clientId: "client1", forwardPhone: "+15550009999", dialTimeoutSeconds: "15" }),
    );
    expect(result).toEqual({ error: "Client not found" });
  });

  it("lets an agency_admin edit their own client", async () => {
    fakeIsSitewyreAdmin = false;
    fakeAgencyId = "agency1";
    const { setClientCallRouting } = await import("@/app/admin/actions");
    const result = await setClientCallRouting(
      fd({ clientId: "client1", forwardPhone: "+15550009999", dialTimeoutSeconds: "15" }),
    );
    expect(result).toEqual({ ok: true });
  });
});

describe("addClient", () => {
  it("rejects an invalid payload before calling createClientAccount", async () => {
    const { addClient } = await import("@/app/admin/actions");
    const result = await addClient(fd({ businessName: "", niche: "cleaning", ownerEmail: "not-an-email" }));
    expect("error" in result).toBe(true);
    expect(createClientAccount).not.toHaveBeenCalled();
  });

  it("defaults a sitewyre_admin's new client to the Sitewyre agency", async () => {
    createClientAccount.mockResolvedValue({
      ok: true,
      clientId: "new-client",
      siteKey: "sk",
      twilioPhoneNumber: null,
    });
    const { addClient } = await import("@/app/admin/actions");
    const result = await addClient(
      fd({
        businessName: "Acme Plumbing",
        ownerName: "Jo Owner",
        ownerEmail: "jo@example.com",
        niche: "plumbing",
      }),
    );
    expect(result).toEqual({ ok: true, clientId: "new-client" });
    expect(createClientAccount).toHaveBeenCalledWith(
      fakeAdminSupabase,
      expect.objectContaining({ business_name: "Acme Plumbing", trade: "plumbing" }),
      expect.objectContaining({
        agencyId: "b39e554f-05e0-488f-8654-1ae3db73f15a",
        actorId: "admin1",
        auditVia: "admin_add_client",
      }),
    );
  });

  it("scopes an agency_admin's new client to their own agency", async () => {
    fakeIsSitewyreAdmin = false;
    fakeAgencyId = "agency1";
    createClientAccount.mockResolvedValue({
      ok: true,
      clientId: "new-client",
      siteKey: "sk",
      twilioPhoneNumber: null,
    });
    const { addClient } = await import("@/app/admin/actions");
    await addClient(
      fd({
        businessName: "Acme Plumbing",
        ownerEmail: "jo@example.com",
        niche: "plumbing",
      }),
    );
    expect(createClientAccount).toHaveBeenCalledWith(
      fakeAdminSupabase,
      expect.anything(),
      expect.objectContaining({ agencyId: "agency1" }),
    );
  });

  it("saves the website domain trimmed down from a pasted link", async () => {
    createClientAccount.mockResolvedValue({ ok: true, clientId: "new-client", siteKey: "sk", twilioPhoneNumber: null });
    const { addClient } = await import("@/app/admin/actions");
    await addClient(
      fd({
        businessName: "Acme Plumbing",
        ownerEmail: "jo@example.com",
        niche: "plumbing",
        domain: "https://www.Acme-Plumbing.com/contact",
      }),
    );
    expect(createClientAccount).toHaveBeenCalledWith(
      fakeAdminSupabase,
      expect.objectContaining({ domain: "acme-plumbing.com" }),
      expect.anything(),
    );
  });

  it("rejects something that isn't a domain", async () => {
    const { addClient } = await import("@/app/admin/actions");
    const result = await addClient(
      fd({ businessName: "Acme Plumbing", ownerEmail: "jo@example.com", niche: "plumbing", domain: "not a domain" }),
    );
    expect(result).toEqual({ error: expect.stringContaining("acme-plumbing.com") });
    expect(createClientAccount).not.toHaveBeenCalled();
  });

  it("rejects a domain another client already uses", async () => {
    domainTaken = true;
    const { addClient } = await import("@/app/admin/actions");
    const result = await addClient(
      fd({ businessName: "Acme Plumbing", ownerEmail: "jo@example.com", niche: "plumbing", domain: "acme-plumbing.com" }),
    );
    expect(result).toEqual({ error: expect.stringContaining("already uses") });
    expect(createClientAccount).not.toHaveBeenCalled();
  });
});

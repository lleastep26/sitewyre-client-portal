import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let fakeRole: string;
let existingRow: { status: string } | null;
let upserts: { row: Record<string, unknown>; options: unknown }[];
let updates: { patch: Record<string, unknown>; filters: [string, string][] }[];

const supabase = {
  from(table: string) {
    if (table !== "integrations") throw new Error(`unexpected table ${table}`);
    return {
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existingRow }) }) }) }),
      upsert: async (row: Record<string, unknown>, options: unknown) => {
        upserts.push({ row, options });
        return { error: null };
      },
      update: (patch: Record<string, unknown>) => {
        const record = { patch, filters: [] as [string, string][] };
        updates.push(record);
        const chain = {
          eq(col: string, value: string) {
            record.filters.push([col, value]);
            return chain;
          },
          then(resolve: (v: { error: null }) => void) {
            resolve({ error: null });
          },
        };
        return chain;
      },
    };
  },
};

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireMembership: async () => ({ supabase, client: { id: "client1" }, role: fakeRole, user: { id: "user1" } }),
}));

function fd(provider: string) {
  const form = new FormData();
  form.set("provider", provider);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRole = "owner";
  existingRow = null;
  upserts = [];
  updates = [];
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requestIntegration", () => {
  it("records the owner's request without calling any outside service", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { requestIntegration } = await import("@/app/(app)/settings/integrations-actions");
    expect(await requestIntegration(fd("meta_ads"))).toEqual({ ok: true });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]!.row).toMatchObject({
      client_id: "client1",
      provider: "meta_ads",
      status: "requested",
      requested_by_user_id: "user1",
      requested_at: expect.any(String),
    });
    expect(upserts[0]!.options).toEqual({ onConflict: "client_id,provider" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("blocks office and crew", async () => {
    fakeRole = "office";
    const { requestIntegration } = await import("@/app/(app)/settings/integrations-actions");
    expect(await requestIntegration(fd("meta_ads"))).toEqual({ error: expect.stringContaining("owner or an admin") });
    expect(upserts).toHaveLength(0);
  });

  it("lets a Sitewyre admin request on a client's behalf", async () => {
    fakeRole = "sitewyre_admin";
    const { requestIntegration } = await import("@/app/(app)/settings/integrations-actions");
    expect(await requestIntegration(fd("google_lsa"))).toEqual({ ok: true });
    expect(upserts).toHaveLength(1);
  });

  it("rejects a provider that isn't one of the three", async () => {
    const { requestIntegration } = await import("@/app/(app)/settings/integrations-actions");
    expect(await requestIntegration(fd("tiktok"))).toEqual({ error: "Unknown integration." });
    expect(upserts).toHaveLength(0);
  });

  it("never downgrades a live connection back to requested", async () => {
    existingRow = { status: "connected" };
    const { requestIntegration } = await import("@/app/(app)/settings/integrations-actions");
    expect(await requestIntegration(fd("meta_ads"))).toEqual({ ok: true });
    expect(upserts).toHaveLength(0);
  });
});

describe("cancelIntegrationRequest", () => {
  it("only ever cancels a pending request", async () => {
    const { cancelIntegrationRequest } = await import("@/app/(app)/settings/integrations-actions");
    expect(await cancelIntegrationRequest(fd("meta_ads"))).toEqual({ ok: true });
    expect(updates[0]!.patch).toMatchObject({ status: "disconnected", requested_at: null });
    expect(updates[0]!.filters).toEqual([
      ["client_id", "client1"],
      ["provider", "meta_ads"],
      ["status", "requested"],
    ]);
  });

  it("blocks crew", async () => {
    fakeRole = "crew";
    const { cancelIntegrationRequest } = await import("@/app/(app)/settings/integrations-actions");
    expect(await cancelIntegrationRequest(fd("meta_ads"))).toEqual({ error: expect.stringContaining("owner or an admin") });
    expect(updates).toHaveLength(0);
  });
});

describe("isAdProviderApproved", () => {
  it("is pending until that platform's flag is set to true", async () => {
    const { isAdProviderApproved, AD_PROVIDERS } = await import("@/lib/integrations/ads");
    expect(AD_PROVIDERS.map((p) => p.id)).toEqual(["meta_ads", "google_lsa", "google_business_profile"]);
    expect(isAdProviderApproved("meta_ads")).toBe(false);
    vi.stubEnv("META_ADS_APPROVED", "true");
    expect(isAdProviderApproved("meta_ads")).toBe(true);
    expect(isAdProviderApproved("google_lsa")).toBe(false);
  });
});

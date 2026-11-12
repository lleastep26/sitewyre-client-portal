import { beforeEach, describe, expect, it, vi } from "vitest";

let fakeSupabase: unknown;
let fakeClient: {
  id: string;
  phone: string | null;
  logo_url: string | null;
};
let fakeRole: string;

const storageUpload = vi.fn().mockResolvedValue({ error: null });
const storageRemove = vi.fn().mockResolvedValue({ error: null });
const storageGetPublicUrl = vi.fn((path: string) => ({
  data: { publicUrl: `https://storage.example.com/object/public/business-logos/${path}` },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireMembership: async () => ({
    supabase: fakeSupabase,
    client: fakeClient,
    role: fakeRole,
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        upload: storageUpload,
        remove: storageRemove,
        getPublicUrl: storageGetPublicUrl,
      }),
    },
  }),
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

beforeEach(() => {
  vi.clearAllMocks();
  fakeClient = { id: "client1", phone: "+15550001111", logo_url: null };
  fakeRole = "owner";
});

function fd(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}

const BASE_FIELDS = {
  business_name: "Acme Cleaning",
  legal_business_name: "",
  owner_name: "",
  business_email: "",
  phone: "",
  website: "",
  domain: "",
  trade: "",
  address_line1: "",
  city: "",
  state: "",
  postal_code: "",
  country: "",
  timezone: "",
};

describe("updateBusinessProfile", () => {
  it("blocks office from editing the business profile", async () => {
    fakeRole = "office";
    const updates: unknown[] = [];
    fakeSupabase = { from: () => makeClientsTable((p) => updates.push(p)) };
    const { updateBusinessProfile } = await import(
      "@/app/(app)/settings/business-profile-actions"
    );
    const result = await updateBusinessProfile(fd(BASE_FIELDS));
    expect(result).toEqual({ error: expect.stringContaining("owner or a Sitewyre admin") });
    expect(updates).toHaveLength(0);
  });

  it("blocks crew from editing the business profile", async () => {
    fakeRole = "crew";
    const updates: unknown[] = [];
    fakeSupabase = { from: () => makeClientsTable((p) => updates.push(p)) };
    const { updateBusinessProfile } = await import(
      "@/app/(app)/settings/business-profile-actions"
    );
    const result = await updateBusinessProfile(fd(BASE_FIELDS));
    expect(result).toEqual({ error: expect.stringContaining("owner or a Sitewyre admin") });
    expect(updates).toHaveLength(0);
  });

  it("allows the owner to save and normalizes the phone to E.164", async () => {
    const updates: unknown[] = [];
    fakeSupabase = { from: () => makeClientsTable((p) => updates.push(p)) };
    const { updateBusinessProfile } = await import(
      "@/app/(app)/settings/business-profile-actions"
    );
    const result = await updateBusinessProfile(
      fd({ ...BASE_FIELDS, phone: "(555) 987-6543" }),
    );
    expect(result).toEqual({ ok: true });
    expect(updates[0]).toMatchObject({ phone: "+15559876543" });
  });

  it("ignores a domain change from a non-admin owner, even if submitted", async () => {
    const updates: unknown[] = [];
    fakeSupabase = { from: () => makeClientsTable((p) => updates.push(p)) };
    const { updateBusinessProfile } = await import(
      "@/app/(app)/settings/business-profile-actions"
    );
    await updateBusinessProfile(fd({ ...BASE_FIELDS, domain: "sneaky.com" }));
    expect(updates[0]).not.toHaveProperty("domain");
  });

  it("lets a sitewyre_admin set the domain, normalized to a bare host", async () => {
    fakeRole = "sitewyre_admin";
    const updates: unknown[] = [];
    fakeSupabase = { from: () => makeClientsTable((p) => updates.push(p)) };
    const { updateBusinessProfile } = await import(
      "@/app/(app)/settings/business-profile-actions"
    );
    await updateBusinessProfile(
      fd({ ...BASE_FIELDS, domain: "https://www.example.com/path" }),
    );
    expect(updates[0]).toMatchObject({ domain: "example.com" });
  });

  it("rejects an invalid email without writing anything", async () => {
    const updates: unknown[] = [];
    fakeSupabase = { from: () => makeClientsTable((p) => updates.push(p)) };
    const { updateBusinessProfile } = await import(
      "@/app/(app)/settings/business-profile-actions"
    );
    const result = await updateBusinessProfile(
      fd({ ...BASE_FIELDS, business_email: "not-an-email" }),
    );
    expect("error" in result).toBe(true);
    expect(updates).toHaveLength(0);
  });
});

describe("uploadBusinessLogo", () => {
  it("blocks office from uploading a logo", async () => {
    fakeRole = "office";
    fakeSupabase = { from: () => makeClientsTable(() => undefined) };
    const { uploadBusinessLogo } = await import(
      "@/app/(app)/settings/business-profile-actions"
    );
    const fdLogo = new FormData();
    fdLogo.set("logo", new File([new Uint8Array(10)], "logo.png", { type: "image/png" }));
    const result = await uploadBusinessLogo(fdLogo);
    expect(result).toEqual({ error: expect.stringContaining("owner or a Sitewyre admin") });
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it("rejects a file over 2.5MB", async () => {
    fakeSupabase = { from: () => makeClientsTable(() => undefined) };
    const { uploadBusinessLogo } = await import(
      "@/app/(app)/settings/business-profile-actions"
    );
    const big = new Uint8Array(3 * 1024 * 1024);
    const fdLogo = new FormData();
    fdLogo.set("logo", new File([big], "logo.png", { type: "image/png" }));
    const result = await uploadBusinessLogo(fdLogo);
    expect(result).toEqual({ error: expect.stringContaining("2.5MB") });
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it("rejects an SVG (dropped per the sanitization decision)", async () => {
    fakeSupabase = { from: () => makeClientsTable(() => undefined) };
    const { uploadBusinessLogo } = await import(
      "@/app/(app)/settings/business-profile-actions"
    );
    const fdLogo = new FormData();
    fdLogo.set(
      "logo",
      new File([new Uint8Array(10)], "logo.svg", { type: "image/svg+xml" }),
    );
    const result = await uploadBusinessLogo(fdLogo);
    expect(result).toEqual({ error: expect.stringContaining("PNG or JPG") });
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it("uploads a valid PNG, saves the public URL, and removes the old logo", async () => {
    fakeClient.logo_url =
      "https://storage.example.com/object/public/business-logos/client1/logo-111.png";
    const updates: unknown[] = [];
    fakeSupabase = { from: () => makeClientsTable((p) => updates.push(p)) };
    const { uploadBusinessLogo } = await import(
      "@/app/(app)/settings/business-profile-actions"
    );
    const fdLogo = new FormData();
    fdLogo.set("logo", new File([new Uint8Array(10)], "logo.png", { type: "image/png" }));
    const result = await uploadBusinessLogo(fdLogo);
    expect("ok" in result && result.ok).toBe(true);
    expect(storageUpload).toHaveBeenCalledTimes(1);
    expect(updates[0]).toMatchObject({
      logo_url: expect.stringContaining("business-logos/client1/logo-"),
    });
    expect(storageRemove).toHaveBeenCalledWith(["client1/logo-111.png"]);
  });
});

describe("removeBusinessLogo", () => {
  it("blocks crew from removing the logo", async () => {
    fakeRole = "crew";
    fakeSupabase = { from: () => makeClientsTable(() => undefined) };
    const { removeBusinessLogo } = await import(
      "@/app/(app)/settings/business-profile-actions"
    );
    const result = await removeBusinessLogo();
    expect(result).toEqual({ error: expect.stringContaining("owner or a Sitewyre admin") });
    expect(storageRemove).not.toHaveBeenCalled();
  });

  it("nulls logo_url and removes the stored file", async () => {
    fakeClient.logo_url =
      "https://storage.example.com/object/public/business-logos/client1/logo-222.png";
    const updates: unknown[] = [];
    fakeSupabase = { from: () => makeClientsTable((p) => updates.push(p)) };
    const { removeBusinessLogo } = await import(
      "@/app/(app)/settings/business-profile-actions"
    );
    const result = await removeBusinessLogo();
    expect(result).toEqual({ ok: true });
    expect(updates[0]).toMatchObject({ logo_url: null });
    expect(storageRemove).toHaveBeenCalledWith(["client1/logo-222.png"]);
  });
});

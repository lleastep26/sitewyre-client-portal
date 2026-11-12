import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveTxt = vi.fn();
const domainsCreate = vi.fn();
const domainsGet = vi.fn();
const domainsVerify = vi.fn();

vi.mock("dns/promises", () => ({ resolveTxt: (name: string) => resolveTxt(name) }));
vi.mock("resend", () => ({
  Resend: class {
    domains = {
      create: domainsCreate,
      get: domainsGet,
      verify: domainsVerify,
    };
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
});

describe("buildDmarcRecord", () => {
  it("reports verified when a DMARC TXT record is found", async () => {
    resolveTxt.mockResolvedValue([["v=DMARC1; p=none"]]);
    const { buildDmarcRecord } = await import("@/lib/email/resend-domains");
    const record = await buildDmarcRecord("example.com");
    expect(record).toMatchObject({
      record: "DMARC",
      type: "TXT",
      name: "_dmarc.example.com",
      status: "verified",
    });
  });

  it("reports pending when no matching TXT record is found", async () => {
    resolveTxt.mockResolvedValue([["v=spf1 include:_spf.example.com ~all"]]);
    const { buildDmarcRecord } = await import("@/lib/email/resend-domains");
    const record = await buildDmarcRecord("example.com");
    expect(record.status).toBe("pending");
  });

  it("reports not_started when the lookup fails (no record at all)", async () => {
    resolveTxt.mockRejectedValue(new Error("ENOTFOUND"));
    const { buildDmarcRecord } = await import("@/lib/email/resend-domains");
    const record = await buildDmarcRecord("example.com");
    expect(record.status).toBe("not_started");
  });
});

describe("createEmailDomain", () => {
  it("creates the domain with Resend and appends the DMARC record", async () => {
    resolveTxt.mockRejectedValue(new Error("ENOTFOUND"));
    domainsCreate.mockResolvedValue({
      data: {
        id: "dom_123",
        status: "pending",
        records: [{ record: "SPF", type: "TXT", name: "example.com", value: "v=spf1", status: "pending" }],
      },
      error: null,
    });
    const { createEmailDomain } = await import("@/lib/email/resend-domains");
    const result = await createEmailDomain("example.com");
    expect(result.id).toBe("dom_123");
    expect(result.status).toBe("pending");
    expect(result.records.map((r) => r.record)).toEqual(["SPF", "DMARC"]);
  });

  it("throws with Resend's error message on failure", async () => {
    domainsCreate.mockResolvedValue({ data: null, error: { message: "Domain already exists" } });
    const { createEmailDomain } = await import("@/lib/email/resend-domains");
    await expect(createEmailDomain("example.com")).rejects.toThrow("Domain already exists");
  });
});

describe("refreshEmailDomain", () => {
  it("kicks off verification, then reads back the fresh status and records", async () => {
    resolveTxt.mockRejectedValue(new Error("ENOTFOUND"));
    domainsVerify.mockResolvedValue({ data: { id: "dom_123" }, error: null });
    domainsGet.mockResolvedValue({
      data: {
        status: "verified",
        records: [{ record: "DKIM", type: "CNAME", name: "x", value: "y", status: "verified" }],
      },
      error: null,
    });
    const { refreshEmailDomain } = await import("@/lib/email/resend-domains");
    const result = await refreshEmailDomain("dom_123", "example.com");
    expect(domainsVerify).toHaveBeenCalledWith("dom_123");
    expect(result.status).toBe("verified");
    expect(result.records.map((r) => r.record)).toEqual(["DKIM", "DMARC"]);
  });
});

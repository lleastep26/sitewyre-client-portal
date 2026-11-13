import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordScriptSeen, websiteStatus } from "@/lib/website/status";
import { INSTALL_GUIDES, gtmSnippet, websiteSnippet } from "@/lib/website/install-guides";
import { smsConsentText, smsPrivacySection } from "@/lib/a2p/consent-text";

let updates: unknown[];
const supabase = {
  from: () => ({
    update: (patch: unknown) => {
      updates.push(patch);
      return { eq: async () => ({ error: null }) };
    },
  }),
} as never;

const NOW = new Date("2026-11-13T22:00:00.000Z");
const fresh = { id: "client1", website_script_seen_at: null, website_script_seen_host: null };

beforeEach(() => {
  updates = [];
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://portal.example");
});

describe("recordScriptSeen", () => {
  it("records the first time the script loads on a website", async () => {
    await recordScriptSeen(supabase, fresh, "https://www.acme-plumbing.com", NOW);
    expect(updates).toEqual([
      { website_script_seen_at: NOW.toISOString(), website_script_seen_host: "acme-plumbing.com" },
    ]);
  });

  it("doesn't write again within the hour for the same website", async () => {
    const seen = {
      id: "client1",
      website_script_seen_at: "2026-11-13T21:30:00.000Z",
      website_script_seen_host: "acme-plumbing.com",
    };
    await recordScriptSeen(supabase, seen, "https://acme-plumbing.com/contact", NOW);
    expect(updates).toEqual([]);
    await recordScriptSeen(supabase, { ...seen, website_script_seen_at: "2026-11-13T20:00:00.000Z" }, "https://acme-plumbing.com", NOW);
    expect(updates).toHaveLength(1);
  });

  it("writes straight away when the script turns up on a different website", async () => {
    await recordScriptSeen(
      supabase,
      { id: "client1", website_script_seen_at: "2026-11-13T21:59:00.000Z", website_script_seen_host: "acme-plumbing.com" },
      "https://other-site.com",
      NOW,
    );
    expect(updates).toEqual([expect.objectContaining({ website_script_seen_host: "other-site.com" })]);
  });

  it("ignores the portal's own pages, local previews and requests with no origin", async () => {
    await recordScriptSeen(supabase, fresh, "https://portal.example", NOW);
    await recordScriptSeen(supabase, fresh, "http://localhost:3000", NOW);
    await recordScriptSeen(supabase, fresh, null, NOW);
    expect(updates).toEqual([]);
  });
});

describe("websiteStatus", () => {
  const base = { domain: "acme-plumbing.com", live_site_url: null, website_script_seen_at: null, website_script_seen_host: null };

  it("needs a website address first", () => {
    expect(websiteStatus({ ...base, domain: null })).toEqual({ state: "no_domain" });
  });

  it("says not seen until the script loads", () => {
    expect(websiteStatus(base)).toEqual({ state: "not_seen" });
  });

  it("is connected when the script last loaded on the saved website (www or not)", () => {
    expect(
      websiteStatus({ ...base, domain: "www.Acme-Plumbing.com", website_script_seen_at: NOW.toISOString(), website_script_seen_host: "acme-plumbing.com" }),
    ).toEqual({ state: "connected", host: "acme-plumbing.com", seenAt: NOW.toISOString() });
  });

  it("flags the script loading on some other website", () => {
    expect(
      websiteStatus({ ...base, website_script_seen_at: NOW.toISOString(), website_script_seen_host: "acme.wixsite.com" }),
    ).toEqual({ state: "other_site", host: "acme.wixsite.com", seenAt: NOW.toISOString() });
  });
});

describe("install code and guides", () => {
  it("builds the one-line tag and a Tag Manager version without data- attributes", () => {
    expect(websiteSnippet("https://portal.example", "abc")).toBe(
      '<script src="https://portal.example/widget.js" data-site-key="abc" async></script>',
    );
    const gtm = gtmSnippet("https://portal.example", "abc");
    expect(gtm).toContain('s.src = "https://portal.example/widget.js?site=abc";');
    expect(gtm).not.toContain("data-site-key");
  });

  it("covers the seven builders, and sends GoDaddy to the embeds", () => {
    expect(INSTALL_GUIDES.map((g) => g.id)).toEqual([
      "wordpress", "wix", "squarespace", "godaddy", "shopify", "webflow", "gtm",
    ]);
    expect(INSTALL_GUIDES.find((g) => g.id === "godaddy")?.uses).toBe("embeds");
    expect(INSTALL_GUIDES.find((g) => g.id === "gtm")?.uses).toBe("gtm");
    for (const guide of INSTALL_GUIDES) expect(guide.steps.length).toBeGreaterThan(0);
  });
});

describe("consent wording", () => {
  it("names the business and the three purposes the A2P campaign registers", () => {
    const text = smsConsentText("Acme Plumbing");
    expect(text).toContain("text messages from Acme Plumbing about your request, appointments and service");
    expect(text).toContain("Reply STOP to opt out, HELP for help.");
    expect(text).not.toMatch(/invoice/i);
  });

  it("gives a privacy section that rules out sharing numbers for marketing", () => {
    const section = smsPrivacySection("Acme Plumbing");
    expect(section).toContain("Text messaging (SMS)");
    expect(section).toContain("Acme Plumbing may send you text messages about your request, appointments and service");
    expect(section).toContain("We do not sell, rent or share your mobile number");
    expect(section).toContain("Reply STOP");
  });
});

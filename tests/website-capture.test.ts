import { describe, expect, it } from "vitest";
import { findDuplicateLead, sameMessage, toCapturedLead } from "@/lib/website/capture";

const base = { site_key: "abc" };

describe("toCapturedLead", () => {
  it("takes a phone lead and normalises the number", () => {
    expect(
      toCapturedLead({ ...base, name: " Jo Smith ", phone: "(405) 555-0142", message: "Need a quote" }),
    ).toEqual({ name: "Jo Smith", phone: "+14055550142", email: null, message: "Need a quote" });
  });

  it("takes an email-only enquiry when there's a message", () => {
    expect(toCapturedLead({ ...base, email: "Jo@Example.com", message: "Do you clean offices?" })).toEqual({
      name: "jo",
      phone: "",
      email: "jo@example.com",
      message: "Do you clean offices?",
    });
  });

  it("drops an email with no message (a newsletter sign-up) and anything with no way to reply", () => {
    expect(toCapturedLead({ ...base, email: "jo@example.com" })).toBeNull();
    expect(toCapturedLead({ ...base, name: "Jo", message: "Hello" })).toBeNull();
    expect(toCapturedLead({ ...base, phone: "555-0142", message: "No area code" })).toBeNull();
    expect(toCapturedLead({ ...base, email: "not-an-email", message: "Hello" })).toBeNull();
  });

  it("fills in a message and a name when the form had none", () => {
    expect(
      toCapturedLead({ ...base, phone: "4055550142", page_url: "https://acme.com/contact-us?x=1" }),
    ).toEqual({
      name: "Website visitor",
      phone: "+14055550142",
      email: null,
      message: "Sent from the form on your website (/contact-us).",
    });
  });
});

describe("sameMessage", () => {
  it("matches the same text, and one copy wrapped in extra lines", () => {
    expect(sameMessage("Need a deep clean ", "need a  deep clean")).toBe(true);
    expect(sameMessage("Quote request\nService: Deep clean\nNotes: Need a deep clean Friday", "Need a deep clean Friday")).toBe(true);
    expect(sameMessage("Need a deep clean", "Do you do windows?")).toBe(false);
    // Too short to prove anything by being contained.
    expect(sameMessage("Hi", "Hi there, I need a quote")).toBe(false);
  });
});

describe("findDuplicateLead", () => {
  const NOW = new Date("2026-11-13T22:00:00.000Z");
  const lead = { name: "Jo", phone: "+14055550142", email: "jo@example.com", message: "Need a deep clean Friday" };
  const fake = (rows: unknown[]) =>
    ({
      from: () => {
        const chain = {
          select: () => chain,
          eq: () => chain,
          gte: () => chain,
          order: () => chain,
          limit: async () => ({ data: rows }),
        };
        return chain;
      },
    }) as never;
  const row = (overrides: Record<string, unknown>) => ({
    id: "lead1",
    phone: "4055550142",
    email: null,
    message: "Something else entirely",
    created_at: "2026-11-13T21:59:57.000Z",
    ...overrides,
  });

  it("finds the same person's lead from seconds ago, whatever its message", async () => {
    expect(await findDuplicateLead(fake([row({})]), "client1", lead, NOW)).toEqual({ id: "lead1" });
  });

  it("finds an older lead in the window only when the message is the same", async () => {
    const fiveMinutesAgo = "2026-11-13T21:55:00.000Z";
    expect(
      await findDuplicateLead(fake([row({ created_at: fiveMinutesAgo })]), "client1", lead, NOW),
    ).toBeNull();
    expect(
      await findDuplicateLead(
        fake([row({ created_at: fiveMinutesAgo, message: "Quote request\nNeed a deep clean Friday" })]),
        "client1",
        lead,
        NOW,
      ),
    ).toEqual({ id: "lead1" });
  });

  it("matches on email too, and ignores other people", async () => {
    expect(
      await findDuplicateLead(fake([row({ phone: "", email: "JO@example.com" })]), "client1", lead, NOW),
    ).toEqual({ id: "lead1" });
    expect(
      await findDuplicateLead(fake([row({ phone: "+14055559999", email: "sam@example.com" })]), "client1", lead, NOW),
    ).toBeNull();
  });
});

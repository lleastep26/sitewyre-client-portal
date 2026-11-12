import { describe, expect, it } from "vitest";
import { resolveEmailFromAddress } from "@/lib/email/from-address";

describe("resolveEmailFromAddress", () => {
  it("returns nothing when the domain isn't verified — keep the current sender", () => {
    expect(
      resolveEmailFromAddress({
        email_domain: "example.com",
        email_domain_status: "pending",
        email_from_name: null,
        email_reply_to: null,
        business_name: "Acme",
      }),
    ).toEqual({});
  });

  it("returns nothing when there's no domain at all", () => {
    expect(
      resolveEmailFromAddress({
        email_domain: null,
        email_domain_status: "verified",
        email_from_name: null,
        email_reply_to: null,
        business_name: "Acme",
      }),
    ).toEqual({});
  });

  it("builds a from-address from the business name once verified", () => {
    expect(
      resolveEmailFromAddress({
        email_domain: "mail.acme.com",
        email_domain_status: "verified",
        email_from_name: null,
        email_reply_to: null,
        business_name: "Acme Cleaning",
      }),
    ).toEqual({ from: "Acme Cleaning <notifications@mail.acme.com>", replyTo: undefined });
  });

  it("prefers the custom from-name and includes reply-to when set", () => {
    expect(
      resolveEmailFromAddress({
        email_domain: "mail.acme.com",
        email_domain_status: "verified",
        email_from_name: "Acme Support",
        email_reply_to: "support@acme.com",
        business_name: "Acme Cleaning",
      }),
    ).toEqual({
      from: "Acme Support <notifications@mail.acme.com>",
      replyTo: "support@acme.com",
    });
  });
});

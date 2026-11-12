import { describe, expect, it } from "vitest";
import {
  businessProfileSchema,
  isValidDomain,
  isValidE164Phone,
  isValidWebsiteUrl,
} from "@/lib/business-profile/validate";

describe("isValidE164Phone", () => {
  it("accepts a plain 10-digit US number", () => {
    expect(isValidE164Phone("(555) 123-4567")).toBe(true);
  });

  it("accepts an already-E.164 number", () => {
    expect(isValidE164Phone("+15551234567")).toBe(true);
  });

  it("rejects too few digits", () => {
    expect(isValidE164Phone("12345")).toBe(false);
  });

  it("rejects non-numeric garbage", () => {
    expect(isValidE164Phone("not a phone")).toBe(false);
  });
});

describe("isValidDomain", () => {
  it("accepts a plain hostname", () => {
    expect(isValidDomain("example.com")).toBe(true);
  });

  it("accepts a hostname with a scheme and path", () => {
    expect(isValidDomain("https://www.example.com/path")).toBe(true);
  });

  it("rejects a hostname with no TLD", () => {
    expect(isValidDomain("localhost")).toBe(false);
  });

  it("rejects garbage", () => {
    expect(isValidDomain("not a domain!!")).toBe(false);
  });
});

describe("isValidWebsiteUrl", () => {
  it("accepts a URL with a scheme", () => {
    expect(isValidWebsiteUrl("https://example.com")).toBe(true);
  });

  it("accepts a bare domain and adds https:// implicitly", () => {
    expect(isValidWebsiteUrl("example.com")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidWebsiteUrl("")).toBe(false);
  });

  it("rejects garbage", () => {
    expect(isValidWebsiteUrl("not a url")).toBe(false);
  });
});

describe("businessProfileSchema", () => {
  it("accepts every field blank — all fields are optional", () => {
    const result = businessProfileSchema.safeParse({
      business_name: "",
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
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = businessProfileSchema.safeParse({
      business_name: "",
      legal_business_name: "",
      owner_name: "",
      business_email: "not-an-email",
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
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid phone", () => {
    const result = businessProfileSchema.safeParse({
      business_name: "",
      legal_business_name: "",
      owner_name: "",
      business_email: "",
      phone: "123",
      website: "",
      domain: "",
      trade: "",
      address_line1: "",
      city: "",
      state: "",
      postal_code: "",
      country: "",
      timezone: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a fully populated, valid profile", () => {
    const result = businessProfileSchema.safeParse({
      business_name: "Acme Cleaning",
      legal_business_name: "Acme Cleaning LLC",
      owner_name: "Sam",
      business_email: "sam@acme.com",
      phone: "(555) 123-4567",
      website: "https://acmecleaning.com",
      domain: "acmecleaning.com",
      trade: "cleaning",
      address_line1: "123 Main St",
      city: "Austin",
      state: "TX",
      postal_code: "78701",
      country: "US",
      timezone: "America/Chicago",
    });
    expect(result.success).toBe(true);
  });
});

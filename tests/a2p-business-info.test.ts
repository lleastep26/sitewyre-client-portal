import { describe, expect, it } from "vitest";
import { buildA2pBusinessInfo } from "@/lib/a2p/business-info";
import type { ClientRow } from "@/lib/supabase/types";

function baseClient(overrides: Partial<ClientRow> = {}): ClientRow {
  return {
    legal_business_name: "Acme Cleaning LLC",
    business_name: "Acme Cleaning",
    business_email: "owner@acme.com",
    phone: "+15125550123",
    website: "https://acme.com",
    address_line1: "123 Main St",
    city: "Austin",
    state: "TX",
    postal_code: "78701",
    country: "US",
    owner_name: "Jane Doe",
    a2p_registration_type: "sole_prop",
    ...overrides,
  } as ClientRow;
}

describe("buildA2pBusinessInfo", () => {
  it("prefers legal_business_name over business_name", () => {
    const info = buildA2pBusinessInfo(baseClient());
    expect(info.legalBusinessName).toBe("Acme Cleaning LLC");
  });

  it("falls back to business_name when legal name is missing", () => {
    const info = buildA2pBusinessInfo(baseClient({ legal_business_name: null }));
    expect(info.legalBusinessName).toBe("Acme Cleaning");
  });

  it("defaults registrationType to sole_prop when unset", () => {
    const info = buildA2pBusinessInfo(baseClient({ a2p_registration_type: null }));
    expect(info.registrationType).toBe("sole_prop");
  });

  it("passes the EIN through untouched when given", () => {
    const info = buildA2pBusinessInfo(baseClient(), "123456789");
    expect(info.ein).toBe("123456789");
  });
});

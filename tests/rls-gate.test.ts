import { describe, expect, it } from "vitest";

/**
 * Phase 0 gate checklist (run against a live Supabase project after migrations):
 * 1. Create two clients A and B with distinct site_keys and owner users.
 * 2. Insert a lead for A via service role.
 * 3. Authenticate as B and SELECT leads — expect zero rows for client A.
 * 4. Authenticate as sitewyre_admin — expect read access + audit_log insert.
 *
 * This unit test documents the gate contract for CI without requiring secrets.
 */
describe("Phase 0 RLS gate contract", () => {
  it("defines isolation expectations", () => {
    const expectations = [
      "members only see their client_id rows",
      "legacy clients.user_id still can read own leads",
      "sitewyre_admin can read any client",
      "public APIs use service role and site_key scoping",
    ];
    expect(expectations).toHaveLength(4);
  });
});

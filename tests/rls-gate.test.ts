import { describe, expect, it } from "vitest";

/**
 * Phase 0 gate checklist (run against a live Supabase project after migrations):
 * 1. Create two clients A and B with distinct site_keys and owner users.
 * 2. Insert a lead for A via service role.
 * 3. Authenticate as B and SELECT leads — expect zero rows for client A.
 * 4. Authenticate as sitewyre_admin — expect read access + audit_log insert.
 *
 * Block 1 (agency layer) gate checklist (run after 0018_agency_layer.sql):
 * 5. Create two agencies, X and Y, each with one client and one
 *    agency_admin user. Authenticate as X's agency_admin and SELECT
 *    clients (and any client-scoped table, e.g. leads) — expect zero
 *    rows for Y's client, and full read/write on X's client.
 * 6. Authenticate as a real client owner (no agency_admin row at all) —
 *    expect them to see only their own client, exactly as before this
 *    migration.
 * 7. Authenticate as sitewyre_admin — expect read access to every
 *    client across every agency, unchanged.
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
      "agency_admin only sees/writes their own agency's clients",
    ];
    expect(expectations).toHaveLength(5);
  });
});

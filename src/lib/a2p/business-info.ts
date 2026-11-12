import type { ClientRow } from "@/lib/supabase/types";
import type { A2pBusinessInfo } from "./trust-hub";

export function buildA2pBusinessInfo(client: ClientRow, ein?: string): A2pBusinessInfo {
  const registrationType = (client.a2p_registration_type ?? "sole_prop") as
    | "sole_prop"
    | "low_volume_standard"
    | "same_entity";
  return {
    registrationType,
    legalBusinessName: client.legal_business_name || client.business_name || "",
    businessEmail: client.business_email || "",
    phone: client.phone || "",
    website: client.website || "",
    addressLine1: client.address_line1 || "",
    city: client.city || "",
    state: client.state || "",
    postalCode: client.postal_code || "",
    country: client.country || "US",
    ownerName: client.owner_name || "",
    ein,
  };
}

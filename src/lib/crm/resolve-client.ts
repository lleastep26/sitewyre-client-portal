import type { SupabaseClient } from "@supabase/supabase-js";
import { asTrimmedString, normalizeHost } from "@/lib/utils";
import type { Database } from "@/lib/supabase/types";

type Admin = SupabaseClient<Database>;

export async function resolveClient(
  supabase: Admin,
  opts: {
    site_key?: string;
    client_id?: string;
    domain?: string;
    business_name?: string;
  },
) {
  const siteKey = asTrimmedString(opts.site_key);
  if (siteKey) {
    const { data } = await supabase
      .from("clients")
      .select("*")
      .eq("site_key", siteKey)
      .maybeSingle();
    if (data) return data;
  }

  const clientId = asTrimmedString(opts.client_id);
  if (clientId) {
    const { data } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .maybeSingle();
    if (data) return data;
  }

  const domain = normalizeHost(asTrimmedString(opts.domain));
  if (domain) {
    const { data } = await supabase
      .from("clients")
      .select("*")
      .eq("domain", domain)
      .maybeSingle();
    if (data) return data;
  }

  const businessName = asTrimmedString(opts.business_name);
  if (businessName) {
    const { data } = await supabase
      .from("clients")
      .select("*")
      .ilike("business_name", businessName)
      .maybeSingle();
    if (data) return data;
  }

  return null;
}

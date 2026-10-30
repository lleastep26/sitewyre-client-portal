import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "@/lib/utils";
import type { Database } from "@/lib/supabase/types";

type Admin = SupabaseClient<Database>;

export async function findOrCreateContact(
  supabase: Admin,
  opts: {
    clientId: string;
    name: string;
    phone: string;
    email?: string | null;
    source?: string;
    smsOptIn?: boolean;
  },
) {
  const phone = normalizePhone(opts.phone);
  const email = opts.email?.trim().toLowerCase() || null;

  if (phone) {
    const { data: byPhone } = await supabase
      .from("contacts")
      .select("*")
      .eq("client_id", opts.clientId)
      .contains("phones", [phone])
      .limit(1)
      .maybeSingle();
    if (byPhone) return byPhone;
  }

  if (email) {
    const { data: byEmail } = await supabase
      .from("contacts")
      .select("*")
      .eq("client_id", opts.clientId)
      .contains("emails", [email])
      .limit(1)
      .maybeSingle();
    if (byEmail) return byEmail;
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      client_id: opts.clientId,
      name: opts.name,
      phones: phone ? [phone] : [],
      emails: email ? [email] : [],
      source: opts.source ?? "website",
      sms_opt_in: opts.smsOptIn ?? true,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

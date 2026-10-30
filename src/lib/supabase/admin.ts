import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminEnv } from "./env";
import type { Database } from "./types";

export function createAdminClient() {
  const { url, secretKey } = getSupabaseAdminEnv();

  return createClient<Database>(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

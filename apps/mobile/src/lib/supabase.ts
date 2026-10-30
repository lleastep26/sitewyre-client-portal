import { createClient, type Session } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabaseConfigured = Boolean(url && anon);

export const supabase = supabaseConfigured
  ? createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export async function getSessionUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export async function signInWithMagicLink(email: string) {
  if (!supabase) throw new Error("Supabase not configured");
  return supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
}

export async function signInWithPhoneOtp(phone: string) {
  if (!supabase) throw new Error("Supabase not configured");
  return supabase.auth.signInWithOtp({ phone });
}

export async function verifyPhoneOtp(phone: string, token: string) {
  if (!supabase) throw new Error("Supabase not configured");
  return supabase.auth.verifyOtp({ phone, token, type: "sms" });
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export type { Session };

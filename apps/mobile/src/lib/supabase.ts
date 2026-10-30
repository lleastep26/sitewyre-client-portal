import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabaseConfigured = Boolean(url && anon);

export const supabase = supabaseConfigured
  ? createClient(url, anon, {
      auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    })
  : null;

export function authRedirectUrl() {
  return Linking.createURL("auth/callback");
}

export async function getSessionUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export async function signInWithMagicLink(email: string) {
  if (!supabase) throw new Error("Supabase not configured");
  return supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: authRedirectUrl(),
    },
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

/** Complete magic-link / OAuth callback from a deep link URL. */
export async function completeAuthFromUrl(
  url: string,
): Promise<{ userId: string | null; error?: string }> {
  if (!supabase) return { userId: null, error: "Supabase not configured" };

  try {
    const linked = Linking.parse(url);
    const codeFromLink =
      typeof linked.queryParams?.code === "string"
        ? linked.queryParams.code
        : Array.isArray(linked.queryParams?.code)
          ? linked.queryParams.code[0]
          : null;

    let code = codeFromLink;
    let access_token: string | null = null;
    let refresh_token: string | null = null;

    try {
      const parsed = new URL(url);
      code = code ?? parsed.searchParams.get("code");
      const hash = parsed.hash?.startsWith("#")
        ? parsed.hash.slice(1)
        : parsed.hash;
      if (hash) {
        const params = new URLSearchParams(hash);
        access_token = params.get("access_token");
        refresh_token = params.get("refresh_token");
      }
    } catch {
      // Custom schemes may fail URL parsing; Linking.parse is enough.
    }

    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return { userId: null, error: error.message };
      return { userId: data.session?.user?.id ?? null };
    }

    if (access_token && refresh_token) {
      const { data, error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
      if (error) return { userId: null, error: error.message };
      return { userId: data.session?.user?.id ?? null };
    }
  } catch (err) {
    return {
      userId: null,
      error: err instanceof Error ? err.message : "Invalid auth URL",
    };
  }

  return { userId: null };
}

export type { Session };

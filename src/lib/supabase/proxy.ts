import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "./env";

export function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/book/") ||
    pathname.startsWith("/embed/") ||
    pathname.startsWith("/q/") ||
    pathname.startsWith("/pay/") ||
    pathname.startsWith("/r/") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname === "/widget.js"
  );
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const { url, publishableKey } = getSupabasePublicEnv();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAuthPage =
    pathname.startsWith("/login") || pathname.startsWith("/auth");
  const isPublic = isPublicPath(pathname);

  if (!user && !isAuthPage && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && pathname === "/login") {
    // Only steer AWAY users who actually have access — a logged-in user
    // with no membership and no owned client must be able to stay on
    // /login?error=no_membership, or this redirects them to "/", which
    // (app)/layout redirects right back to /login: an infinite loop.
    const [{ data: memberships }, { data: ownedClient }] = await Promise.all([
      supabase.from("memberships").select("id").eq("user_id", user.id).limit(1),
      supabase.from("clients").select("id").eq("user_id", user.id).maybeSingle(),
    ]);
    const hasAccess = Boolean(memberships?.length) || Boolean(ownedClient);

    if (hasAccess) {
      const redirectUrl = request.nextUrl.clone();
      const next = request.nextUrl.searchParams.get("next");
      redirectUrl.pathname =
        next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
  }

  return supabaseResponse;
}

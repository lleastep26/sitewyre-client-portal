import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_VIEW_COOKIE } from "@/lib/auth/session";

// Route Handlers (unlike Server Components) may mutate cookies, so this is
// where an admin_view_client_id that points at a deleted/missing client
// actually gets cleared, before sending the admin back to /admin.
export async function GET(request: Request) {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_VIEW_COOKIE);
  return NextResponse.redirect(new URL("/admin", request.url));
}

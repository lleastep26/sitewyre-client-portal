"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_VIEW_COOKIE, requireAdmin } from "@/lib/auth/session";

export async function switchAdminViewClient(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!clientId) redirect("/admin");

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) redirect("/admin");

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_VIEW_COOKIE, client.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  await supabase.from("audit_log").insert({
    actor_id: user.id,
    action: "admin_view_as",
    entity: "client",
    entity_id: client.id,
    client_id: client.id,
  });

  redirect("/");
}

export async function clearAdminViewClient() {
  await requireAdmin();
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_VIEW_COOKIE);
  redirect("/admin");
}

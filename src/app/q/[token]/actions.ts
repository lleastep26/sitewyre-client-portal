"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export async function approveQuote(token: string) {
  const supabase = createAdminClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select("*")
    .eq("public_token", token)
    .single();
  if (!quote) return;

  await supabase
    .from("quotes")
    .update({
      status: "accepted",
      signed_at: new Date().toISOString(),
    })
    .eq("id", quote.id);

  revalidatePath(`/q/${token}`);
}

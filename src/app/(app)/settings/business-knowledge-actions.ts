"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { pushBusinessKnowledgeToRetell } from "@/lib/retell/agent-sync";

// Owner and sitewyre_admin/agency_admin only — office and crew view only.
// An agency_admin's view-as session resolves to role "owner" (see
// src/lib/auth/session.ts), so this already covers them.
function canEdit(role: string): boolean {
  return role === "owner" || role === "sitewyre_admin";
}

export async function updateBusinessKnowledge(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEdit(role)) {
    return { error: "Only the owner or a Sitewyre admin can edit this." };
  }

  const servicesOffered = String(formData.get("services_offered") ?? "").trim();
  const afterHoursRules = String(formData.get("after_hours_rules") ?? "").trim();
  const aiNeverSay = String(formData.get("ai_never_say") ?? "").trim();

  const { error } = await supabase
    .from("clients")
    .update({
      services_offered: servicesOffered || null,
      after_hours_rules: afterHoursRules || null,
      ai_never_say: aiNeverSay || null,
    })
    .eq("id", client.id);
  if (error) return { error: error.message };

  await pushBusinessKnowledgeToRetell(supabase, client.id);
  revalidatePath("/settings");
  return { ok: true };
}

export async function addFaq(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEdit(role)) {
    return { error: "Only the owner or a Sitewyre admin can edit this." };
  }

  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();
  if (!question || !answer) return { error: "Enter both a question and an answer." };

  const { count } = await supabase
    .from("client_faqs")
    .select("*", { count: "exact", head: true })
    .eq("client_id", client.id);

  const { error } = await supabase.from("client_faqs").insert({
    client_id: client.id,
    question,
    answer,
    position: count ?? 0,
  });
  if (error) return { error: error.message };

  await pushBusinessKnowledgeToRetell(supabase, client.id);
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateFaq(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEdit(role)) {
    return { error: "Only the owner or a Sitewyre admin can edit this." };
  }

  const faqId = String(formData.get("faqId") ?? "");
  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();
  if (!question || !answer) return { error: "Enter both a question and an answer." };

  const { error } = await supabase
    .from("client_faqs")
    .update({ question, answer })
    .eq("id", faqId)
    .eq("client_id", client.id);
  if (error) return { error: error.message };

  await pushBusinessKnowledgeToRetell(supabase, client.id);
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteFaq(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEdit(role)) {
    return { error: "Only the owner or a Sitewyre admin can edit this." };
  }

  const faqId = String(formData.get("faqId") ?? "");
  const { error } = await supabase
    .from("client_faqs")
    .delete()
    .eq("id", faqId)
    .eq("client_id", client.id);
  if (error) return { error: error.message };

  await pushBusinessKnowledgeToRetell(supabase, client.id);
  revalidatePath("/settings");
  return { ok: true };
}

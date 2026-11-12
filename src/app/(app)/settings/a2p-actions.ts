"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { encryptEin, decryptEin, einLast4 } from "@/lib/a2p/encryption";
import { checkWebsiteReachable } from "@/lib/a2p/website-check";
import {
  advanceA2pPipeline,
  initialPipelineState,
  clearRejectedStage,
  type A2pPipelineState,
} from "@/lib/a2p/pipeline";
import { resendBrandOtp } from "@/lib/a2p/trust-hub";
import { buildA2pBusinessInfo } from "@/lib/a2p/business-info";
import type { ClientRow } from "@/lib/supabase/types";

function canEdit(role: string): boolean {
  return role === "owner" || role === "sitewyre_admin";
}

const EIN_RE = /^\d{2}-?\d{7}$/;

function pipelineOf(client: ClientRow): A2pPipelineState {
  const raw = client.a2p_pipeline as Partial<A2pPipelineState> | null;
  if (!raw || !raw.stage) return initialPipelineState();
  return raw as A2pPipelineState;
}

export type A2pStatusView = {
  registrationType: "sole_prop" | "low_volume_standard" | null;
  einMasked: string | null;
  stage: A2pPipelineState["stage"] | "not_started";
  error: string | null;
  a2pStatus: string | null;
  otpVerifiedAt: string | null;
  brandType: string | null;
};

/** Live check only — never trusts the client's own report of this. */
export async function checkA2pWebsite(): Promise<{ ok: boolean } | { error: string }> {
  const { client } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!client.website) return { ok: false };
  const ok = await checkWebsiteReachable(client.website);
  return { ok };
}

export async function startA2pRegistration(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEdit(role)) {
    return { error: "Only the owner or a Sitewyre admin can register for texting." };
  }

  const registrationType = String(formData.get("registrationType") ?? "");
  if (registrationType !== "sole_prop" && registrationType !== "low_volume_standard") {
    return { error: "Choose a registration path" };
  }

  if (!client.website) {
    return { error: "Add your website URL in Business Profile first." };
  }
  const privacyConfirmed = formData.get("confirmPrivacyPolicy") === "on";
  const consentConfirmed = formData.get("confirmLeadFormConsent") === "on";
  if (!privacyConfirmed || !consentConfirmed) {
    return { error: "Confirm both checklist items before submitting." };
  }
  const websiteOk = await checkWebsiteReachable(client.website);
  if (!websiteOk) {
    return { error: "Your website didn't load — fix it before submitting for registration." };
  }

  let ein: string | undefined;
  const update: Partial<ClientRow> = {
    a2p_registration_type: registrationType,
  };

  if (registrationType === "low_volume_standard") {
    const rawEin = String(formData.get("ein") ?? "").trim();
    if (!EIN_RE.test(rawEin)) {
      return { error: "Enter a valid 9-digit EIN" };
    }
    ein = rawEin.replace(/\D/g, "");
    update.a2p_ein_encrypted = encryptEin(ein);
    update.a2p_ein_last4 = einLast4(ein);
  }

  const info = buildA2pBusinessInfo(
    { ...client, a2p_registration_type: registrationType } as ClientRow,
    ein,
  );
  const state = initialPipelineState();
  const result = await advanceA2pPipeline(info, client.twilio_phone_sid, {
    ...state,
    websiteCheckOk: true,
    checklistConfirmedAt: new Date().toISOString(),
  });

  update.a2p_pipeline = result.state;
  update.a2p_status = result.a2pStatus;

  const { error } = await supabase.from("clients").update(update).eq("id", client.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

export async function advanceA2pRegistration(): Promise<{ ok: true } | { error: string }> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEdit(role)) {
    return { error: "Only the owner or a Sitewyre admin can manage texting registration." };
  }
  if (!client.a2p_registration_type) {
    return { error: "No registration in progress" };
  }

  const ein = client.a2p_ein_encrypted ? decryptEin(client.a2p_ein_encrypted) : undefined;
  const info = buildA2pBusinessInfo(client, ein);
  const state = pipelineOf(client);
  const result = await advanceA2pPipeline(info, client.twilio_phone_sid, state);

  const { error } = await supabase
    .from("clients")
    .update({ a2p_pipeline: result.state, a2p_status: result.a2pStatus })
    .eq("id", client.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

export async function retryA2pStage(): Promise<{ ok: true } | { error: string }> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEdit(role)) {
    return { error: "Only the owner or a Sitewyre admin can retry registration." };
  }

  const cleared = clearRejectedStage(pipelineOf(client));
  const { error } = await supabase
    .from("clients")
    .update({ a2p_pipeline: cleared, a2p_status: "pending" })
    .eq("id", client.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

export async function resendA2pOtp(): Promise<{ ok: true } | { error: string }> {
  const { client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEdit(role)) {
    return { error: "Only the owner or a Sitewyre admin can resend the verification text." };
  }
  const state = pipelineOf(client);
  if (!state.brandSid) return { error: "No brand registration in progress" };

  await resendBrandOtp(state.brandSid);
  return { ok: true };
}


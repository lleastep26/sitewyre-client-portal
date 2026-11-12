import {
  ensureCustomerProfile,
  ensureTrustBundle,
  ensureBrand,
  ensureMessagingService,
  ensureNumberAttached,
  ensureCampaign,
  pollBrandStatus,
  pollCampaignStatus,
  type A2pBusinessInfo,
  type A2pPipelineState,
} from "./trust-hub";
import { buildSampleMessages, buildMessageFlow } from "./sample-messages";

export type { A2pPipelineState } from "./trust-hub";

export type A2pAdvanceResult = {
  state: A2pPipelineState;
  a2pStatus: "pending" | "approved" | "failed";
};

/**
 * Advances the pipeline by exactly one stage's worth of work, starting
 * from whatever `state.stage` says. Each underlying stage function is
 * itself idempotent (skips re-creating a resource whose SID is already
 * saved), so calling this again after a mid-stage failure resumes from
 * there rather than re-running completed stages or re-registering (and
 * re-billing) a Brand/Campaign that already exists.
 *
 * A terminal Twilio-side rejection (brand or campaign FAILED) reports
 * `a2pStatus: "failed"` but leaves `state.stage` where it was — retrying
 * after a rejection is a deliberate action (clearRejectedStage below)
 * that clears the rejected SID so it gets recreated, not an automatic
 * retry loop.
 */
export async function advanceA2pPipeline(
  info: A2pBusinessInfo,
  phoneNumberSid: string | null,
  state: A2pPipelineState,
): Promise<A2pAdvanceResult> {
  try {
    switch (state.stage) {
      case "customer_profile": {
        const next = await ensureCustomerProfile(info, state);
        return { state: next, a2pStatus: "pending" };
      }
      case "trust_bundle": {
        const next = await ensureTrustBundle(info, state);
        return { state: next, a2pStatus: "pending" };
      }
      case "brand": {
        const next = await ensureBrand(info, state);
        return { state: next, a2pStatus: "pending" };
      }
      case "otp_pending": {
        if (!state.brandSid) throw new Error("Missing brand SID while waiting on OTP");
        const poll = await pollBrandStatus(state.brandSid);
        if (poll.status === "FAILED") {
          return {
            state: { ...state, error: poll.errorMessage ?? "Brand registration failed" },
            a2pStatus: "failed",
          };
        }
        if (poll.status === "APPROVED" && poll.identityStatus === "VERIFIED") {
          const next = await ensureMessagingService(info, {
            ...state,
            otpVerifiedAt: new Date().toISOString(),
          });
          return { state: next, a2pStatus: "pending" };
        }
        return { state: { ...state, error: null }, a2pStatus: "pending" };
      }
      case "messaging_service": {
        const next = await ensureMessagingService(info, state);
        return { state: next, a2pStatus: "pending" };
      }
      case "attach_number": {
        if (!phoneNumberSid) throw new Error("Client has no Twilio phone number to attach yet");
        const next = await ensureNumberAttached(phoneNumberSid, state);
        return { state: next, a2pStatus: "pending" };
      }
      case "campaign": {
        if (info.registrationType !== "sole_prop") {
          // low_volume_standard and same_entity have no OTP gate — brand
          // must still be APPROVED before campaign creation (same_entity's
          // brand always already is, so this just confirms it quickly).
          if (!state.brandSid) throw new Error("Missing brand SID before campaign creation");
          const poll = await pollBrandStatus(state.brandSid);
          if (poll.status === "FAILED") {
            return {
              state: { ...state, error: poll.errorMessage ?? "Brand registration failed" },
              a2pStatus: "failed",
            };
          }
          if (poll.status !== "APPROVED") {
            return { state: { ...state, error: null }, a2pStatus: "pending" };
          }
        }
        const next = await ensureCampaign(
          info,
          buildSampleMessages(info.legalBusinessName),
          buildMessageFlow(info.website),
          state,
        );
        return { state: next, a2pStatus: "pending" };
      }
      case "complete": {
        if (!state.campaignSid || !state.messagingServiceSid) {
          throw new Error("Pipeline marked complete without a campaign");
        }
        const poll = await pollCampaignStatus(state.messagingServiceSid, state.campaignSid);
        if (poll.status === "FAILED") {
          return {
            state: { ...state, error: poll.errorMessage ?? "Campaign vetting failed" },
            a2pStatus: "failed",
          };
        }
        if (poll.status === "VERIFIED") {
          return { state: { ...state, error: null }, a2pStatus: "approved" };
        }
        return { state: { ...state, error: null }, a2pStatus: "pending" };
      }
      default:
        return { state, a2pStatus: "pending" };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { state: { ...state, error: message }, a2pStatus: "pending" };
  }
}

export function initialPipelineState(): A2pPipelineState {
  return { stage: "customer_profile", error: null };
}

/**
 * Called when the client clicks "Retry" after a terminal rejection.
 * Clears the SID for whatever got rejected so the next advance call
 * creates a fresh one instead of re-polling a dead resource forever.
 */
export function clearRejectedStage(state: A2pPipelineState): A2pPipelineState {
  if (state.stage === "otp_pending" || state.stage === "brand") {
    const next = { ...state, stage: "brand" as const, error: null };
    delete next.brandSid;
    delete next.brandType;
    return next;
  }
  if (state.stage === "campaign" || state.stage === "complete") {
    const next = { ...state, stage: "campaign" as const, error: null };
    delete next.campaignSid;
    return next;
  }
  return { ...state, error: null };
}

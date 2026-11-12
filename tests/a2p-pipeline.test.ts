import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureCustomerProfile = vi.fn();
const ensureTrustBundle = vi.fn();
const ensureBrand = vi.fn();
const ensureMessagingService = vi.fn();
const ensureNumberAttached = vi.fn();
const ensureCampaign = vi.fn();
const pollBrandStatus = vi.fn();
const pollCampaignStatus = vi.fn();

vi.mock("@/lib/a2p/trust-hub", () => ({
  ensureCustomerProfile: (...a: unknown[]) => ensureCustomerProfile(...a),
  ensureTrustBundle: (...a: unknown[]) => ensureTrustBundle(...a),
  ensureBrand: (...a: unknown[]) => ensureBrand(...a),
  ensureMessagingService: (...a: unknown[]) => ensureMessagingService(...a),
  ensureNumberAttached: (...a: unknown[]) => ensureNumberAttached(...a),
  ensureCampaign: (...a: unknown[]) => ensureCampaign(...a),
  pollBrandStatus: (...a: unknown[]) => pollBrandStatus(...a),
  pollCampaignStatus: (...a: unknown[]) => pollCampaignStatus(...a),
}));

import { advanceA2pPipeline, initialPipelineState, clearRejectedStage } from "@/lib/a2p/pipeline";
import type { A2pBusinessInfo, A2pPipelineState } from "@/lib/a2p/trust-hub";

const info: A2pBusinessInfo = {
  registrationType: "sole_prop",
  legalBusinessName: "Acme",
  businessEmail: "a@acme.com",
  phone: "+15125550123",
  website: "https://acme.com",
  addressLine1: "1 Main St",
  city: "Austin",
  state: "TX",
  postalCode: "78701",
  country: "US",
  ownerName: "Jane",
};

beforeEach(() => vi.clearAllMocks());

describe("advanceA2pPipeline", () => {
  it("delegates to ensureCustomerProfile at the customer_profile stage", async () => {
    ensureCustomerProfile.mockResolvedValue({ stage: "trust_bundle", error: null, customerProfileSid: "BU1" });
    const result = await advanceA2pPipeline(info, null, initialPipelineState());
    expect(ensureCustomerProfile).toHaveBeenCalled();
    expect(result.state.stage).toBe("trust_bundle");
    expect(result.a2pStatus).toBe("pending");
  });

  it("stays pending at otp_pending while unverified", async () => {
    pollBrandStatus.mockResolvedValue({ status: "APPROVED", identityStatus: "UNVERIFIED", errorMessage: null });
    const result = await advanceA2pPipeline(info, null, {
      stage: "otp_pending",
      error: null,
      brandSid: "BN1",
    });
    expect(ensureMessagingService).not.toHaveBeenCalled();
    expect(result.a2pStatus).toBe("pending");
  });

  it("advances to messaging_service once OTP is verified", async () => {
    pollBrandStatus.mockResolvedValue({ status: "APPROVED", identityStatus: "VERIFIED", errorMessage: null });
    ensureMessagingService.mockImplementation((_info, state) => ({
      ...state,
      stage: "attach_number",
      messagingServiceSid: "MG1",
    }));
    const result = await advanceA2pPipeline(info, null, {
      stage: "otp_pending",
      error: null,
      brandSid: "BN1",
    });
    expect(ensureMessagingService).toHaveBeenCalled();
    expect(result.state.otpVerifiedAt).toBeTruthy();
  });

  it("reports a2pStatus failed when the brand is rejected, without crashing", async () => {
    pollBrandStatus.mockResolvedValue({ status: "FAILED", identityStatus: null, errorMessage: "Bad name" });
    const result = await advanceA2pPipeline(info, null, { stage: "otp_pending", error: null, brandSid: "BN1" });
    expect(result.a2pStatus).toBe("failed");
    expect(result.state.error).toBe("Bad name");
  });

  it("requires a phone number SID before attaching a number", async () => {
    const result = await advanceA2pPipeline(info, null, {
      stage: "attach_number",
      error: null,
      messagingServiceSid: "MG1",
    });
    expect(ensureNumberAttached).not.toHaveBeenCalled();
    expect(result.state.error).toContain("no Twilio phone number");
  });

  it("gates the EIN path's campaign stage on brand approval before creating a campaign", async () => {
    pollBrandStatus.mockResolvedValue({ status: "PENDING", identityStatus: null, errorMessage: null });
    const einInfo = { ...info, registrationType: "low_volume_standard" as const, ein: "123456789" };
    const result = await advanceA2pPipeline(einInfo, "PN1", {
      stage: "campaign",
      error: null,
      brandSid: "BN1",
      messagingServiceSid: "MG1",
    });
    expect(ensureCampaign).not.toHaveBeenCalled();
    expect(result.a2pStatus).toBe("pending");
  });

  it("reports approved once the campaign is verified", async () => {
    pollCampaignStatus.mockResolvedValue({ status: "VERIFIED", errorMessage: null });
    const result = await advanceA2pPipeline(info, null, {
      stage: "complete",
      error: null,
      campaignSid: "QE1",
      messagingServiceSid: "MG1",
    });
    expect(result.a2pStatus).toBe("approved");
  });

  it("reports failed when the campaign is rejected", async () => {
    pollCampaignStatus.mockResolvedValue({ status: "FAILED", errorMessage: "Sample message too short" });
    const result = await advanceA2pPipeline(info, null, {
      stage: "complete",
      error: null,
      campaignSid: "QE1",
      messagingServiceSid: "MG1",
    });
    expect(result.a2pStatus).toBe("failed");
    expect(result.state.error).toBe("Sample message too short");
  });

  it("catches a thrown error from a stage function and surfaces it without crashing", async () => {
    ensureCustomerProfile.mockRejectedValue(new Error("Twilio is down"));
    const result = await advanceA2pPipeline(info, null, initialPipelineState());
    expect(result.state.error).toBe("Twilio is down");
    expect(result.a2pStatus).toBe("pending");
  });
});

describe("clearRejectedStage", () => {
  it("clears the brand SID and resets to the brand stage after an otp_pending rejection", () => {
    const cleared = clearRejectedStage({
      stage: "otp_pending",
      error: "Bad name",
      brandSid: "BN1",
      brandType: "SOLE_PROPRIETOR",
      customerProfileSid: "BU1",
    } as A2pPipelineState);
    expect(cleared.stage).toBe("brand");
    expect(cleared.brandSid).toBeUndefined();
    expect(cleared.brandType).toBeUndefined();
    expect(cleared.customerProfileSid).toBe("BU1");
    expect(cleared.error).toBeNull();
  });

  it("clears the campaign SID and resets to the campaign stage after a complete-stage rejection", () => {
    const cleared = clearRejectedStage({
      stage: "complete",
      error: "Bad sample",
      campaignSid: "QE1",
      messagingServiceSid: "MG1",
    } as A2pPipelineState);
    expect(cleared.stage).toBe("campaign");
    expect(cleared.campaignSid).toBeUndefined();
    expect(cleared.messagingServiceSid).toBe("MG1");
  });
});

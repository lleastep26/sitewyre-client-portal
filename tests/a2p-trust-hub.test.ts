import { beforeEach, describe, expect, it, vi } from "vitest";

const customerProfilesCreate = vi.fn();
const customerProfilesList = vi.fn();
const customerProfileEntityAssignmentsCreate = vi.fn();
const customerProfileEvaluationsCreate = vi.fn();
const customerProfileUpdate = vi.fn();
const endUsersCreate = vi.fn();
const addressesCreate = vi.fn();
const trustProductsCreate = vi.fn();
const trustProductEntityAssignmentsCreate = vi.fn();
const trustProductEvaluationsCreate = vi.fn();
const trustProductUpdate = vi.fn();
const brandRegistrationsCreate = vi.fn();
const brandRegistrationFetch = vi.fn();
const brandRegistrationOtpCreate = vi.fn();
const servicesCreate = vi.fn();
const phoneNumbersCreate = vi.fn();
const usAppToPersonCreate = vi.fn();
const usAppToPersonFetch = vi.fn();
const brandRegistrationsList = vi.fn();

vi.mock("twilio", () => ({
  default: () => ({
    trusthub: {
      v1: {
        customerProfiles: Object.assign(
          () => ({
            customerProfilesEntityAssignments: { create: customerProfileEntityAssignmentsCreate },
            customerProfilesEvaluations: { create: customerProfileEvaluationsCreate },
            update: customerProfileUpdate,
          }),
          { create: customerProfilesCreate, list: customerProfilesList },
        ),
        endUsers: { create: endUsersCreate },
        trustProducts: Object.assign(
          () => ({
            trustProductsEntityAssignments: { create: trustProductEntityAssignmentsCreate },
            trustProductsEvaluations: { create: trustProductEvaluationsCreate },
            update: trustProductUpdate,
          }),
          { create: trustProductsCreate },
        ),
        supportingDocuments: { create: vi.fn().mockResolvedValue({ sid: "RDdoc" }) },
      },
    },
    addresses: { create: addressesCreate },
    messaging: {
      v1: {
        brandRegistrations: Object.assign(
          () => ({ fetch: brandRegistrationFetch, brandRegistrationOtps: { create: brandRegistrationOtpCreate } }),
          { create: brandRegistrationsCreate, list: brandRegistrationsList },
        ),
        services: Object.assign(
          () => ({
            phoneNumbers: { create: phoneNumbersCreate },
            usAppToPerson: Object.assign(() => ({ fetch: usAppToPersonFetch }), { create: usAppToPersonCreate }),
          }),
          { create: servicesCreate },
        ),
      },
    },
  }),
}));

import {
  ensureCustomerProfile,
  ensureTrustBundle,
  ensureBrand,
  ensureMessagingService,
  ensureNumberAttached,
  ensureCampaign,
  pollBrandStatus,
  pollCampaignStatus,
  resendBrandOtp,
  getSitewyrePrimaryBrandSid,
  type A2pBusinessInfo,
  type A2pPipelineState,
} from "@/lib/a2p/trust-hub";

const soleProInfo: A2pBusinessInfo = {
  registrationType: "sole_prop",
  legalBusinessName: "Acme Cleaning",
  businessEmail: "owner@acme.com",
  phone: "+15125550123",
  website: "https://acme.com",
  addressLine1: "123 Main St",
  city: "Austin",
  state: "TX",
  postalCode: "78701",
  country: "US",
  ownerName: "Jane Doe",
};

const einInfo: A2pBusinessInfo = { ...soleProInfo, registrationType: "low_volume_standard", ein: "123456789" };

function emptyState(): A2pPipelineState {
  return { stage: "customer_profile", error: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "authtest");
  customerProfilesCreate.mockResolvedValue({ sid: "BUprofile" });
  customerProfilesList.mockResolvedValue([{ sid: "BUprimary", status: "twilio-approved" }]);
  endUsersCreate.mockResolvedValue({ sid: "ITenduser" });
  addressesCreate.mockResolvedValue({ sid: "ADaddr" });
  customerProfileEntityAssignmentsCreate.mockResolvedValue({});
  customerProfileEvaluationsCreate.mockResolvedValue({});
  customerProfileUpdate.mockResolvedValue({});
  trustProductsCreate.mockResolvedValue({ sid: "BUbundle" });
  trustProductEntityAssignmentsCreate.mockResolvedValue({});
  trustProductEvaluationsCreate.mockResolvedValue({});
  trustProductUpdate.mockResolvedValue({});
  brandRegistrationsCreate.mockResolvedValue({ sid: "BNbrand", brandType: "STANDARD" });
  servicesCreate.mockResolvedValue({ sid: "MGservice" });
  phoneNumbersCreate.mockResolvedValue({});
  usAppToPersonCreate.mockResolvedValue({ sid: "QEcampaign" });
  brandRegistrationsList.mockResolvedValue([
    { sid: "BNprimarybrand", customerProfileBundleSid: "BUprimary", status: "APPROVED" },
  ]);
});

describe("ensureCustomerProfile", () => {
  it("creates the profile, end user, address, and supporting doc for Sole Prop", async () => {
    const result = await ensureCustomerProfile(soleProInfo, emptyState());
    expect(customerProfilesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ policySid: expect.stringMatching(/^RN/) }),
    );
    expect(endUsersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: "starter_customer_profile_information" }),
    );
    expect(result.customerProfileSid).toBe("BUprofile");
    expect(result.endUserBusinessSid).toBe("ITenduser");
    expect(result.addressSid).toBe("ADaddr");
    expect(result.stage).toBe("trust_bundle");
  });

  it("creates a business_information end user plus an authorized representative for the EIN path", async () => {
    await ensureCustomerProfile(einInfo, emptyState());
    const businessInfoCall = endUsersCreate.mock.calls.find(
      (c) => c[0].type === "customer_profile_business_information",
    );
    expect(businessInfoCall![0].attributes.business_registration_number).toBe("123456789");
    const repCall = endUsersCreate.mock.calls.find((c) => c[0].type === "authorized_representative_1");
    expect(repCall).toBeTruthy();
  });

  it("is idempotent — skips re-creating resources whose SIDs are already saved", async () => {
    const partial: A2pPipelineState = {
      stage: "customer_profile",
      error: null,
      customerProfileSid: "BUexisting",
      endUserBusinessSid: "ITexisting",
      addressSid: "ADexisting",
      supportingDocSid: "RDexisting",
    };
    await ensureCustomerProfile(soleProInfo, partial);
    expect(customerProfilesCreate).not.toHaveBeenCalled();
    expect(endUsersCreate).not.toHaveBeenCalled();
    expect(addressesCreate).not.toHaveBeenCalled();
  });
});

describe("ensureTrustBundle", () => {
  it("creates the bundle and a sole_proprietor_information end user", async () => {
    const result = await ensureTrustBundle(soleProInfo, {
      stage: "trust_bundle",
      error: null,
      customerProfileSid: "BUprofile",
    });
    expect(trustProductsCreate).toHaveBeenCalled();
    const enduserCall = endUsersCreate.mock.calls.find((c) => c[0].type === "sole_proprietor_information");
    expect(enduserCall![0].attributes.mobile_phone_number).toBe("+15125550123");
    expect(result.trustBundleSid).toBe("BUbundle");
    expect(result.stage).toBe("brand");
  });

  it("is idempotent", async () => {
    await ensureTrustBundle(soleProInfo, {
      stage: "trust_bundle",
      error: null,
      customerProfileSid: "BUprofile",
      trustBundleSid: "BUexisting",
      trustBundleEndUserSid: "ITexisting",
    });
    expect(trustProductsCreate).not.toHaveBeenCalled();
    expect(endUsersCreate).not.toHaveBeenCalled();
  });
});

describe("ensureBrand", () => {
  const baseState: A2pPipelineState = {
    stage: "brand",
    error: null,
    customerProfileSid: "BUprofile",
    trustBundleSid: "BUbundle",
  };

  it("passes brandType SOLE_PROPRIETOR and moves to otp_pending for sole prop", async () => {
    const result = await ensureBrand(soleProInfo, baseState);
    expect(brandRegistrationsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ brandType: "SOLE_PROPRIETOR" }),
    );
    expect(result.stage).toBe("otp_pending");
  });

  it("passes skipAutomaticSecVet for the EIN path and does not wait on OTP", async () => {
    const result = await ensureBrand(einInfo, baseState);
    expect(brandRegistrationsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ skipAutomaticSecVet: true }),
    );
    expect(result.stage).toBe("brand");
  });

  it("never creates a second brand once brandSid is saved (no double-charging)", async () => {
    await ensureBrand(soleProInfo, { ...baseState, brandSid: "BNexisting" });
    expect(brandRegistrationsCreate).not.toHaveBeenCalled();
  });
});

describe("pollBrandStatus / resendBrandOtp", () => {
  it("reports status, identity status, and a readable error message", async () => {
    brandRegistrationFetch.mockResolvedValue({
      status: "FAILED",
      identityStatus: "UNVERIFIED",
      errors: [{ message: "Business name mismatch" }],
    });
    const result = await pollBrandStatus("BNbrand");
    expect(result).toEqual({
      status: "FAILED",
      identityStatus: "UNVERIFIED",
      errorMessage: "Business name mismatch",
    });
  });

  it("resends the OTP via the dedicated sub-resource", async () => {
    await resendBrandOtp("BNbrand");
    expect(brandRegistrationOtpCreate).toHaveBeenCalled();
  });
});

describe("ensureMessagingService / ensureNumberAttached", () => {
  it("creates a per-client messaging service", async () => {
    const result = await ensureMessagingService(soleProInfo, { stage: "messaging_service", error: null });
    expect(servicesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ friendlyName: expect.stringContaining("Acme Cleaning") }),
    );
    expect(result.messagingServiceSid).toBe("MGservice");
    expect(result.stage).toBe("attach_number");
  });

  it("attaches the phone number to the service", async () => {
    const result = await ensureNumberAttached("PNnumber", {
      stage: "attach_number",
      error: null,
      messagingServiceSid: "MGservice",
    });
    expect(phoneNumbersCreate).toHaveBeenCalledWith({ phoneNumberSid: "PNnumber" });
    expect(result.stage).toBe("campaign");
  });

  it("treats an already-attached number as success, not a failure", async () => {
    phoneNumbersCreate.mockRejectedValue(new Error("Phone number already exists on service"));
    const result = await ensureNumberAttached("PNnumber", {
      stage: "attach_number",
      error: null,
      messagingServiceSid: "MGservice",
    });
    expect(result.stage).toBe("campaign");
  });
});

describe("ensureCampaign / pollCampaignStatus", () => {
  const baseState: A2pPipelineState = {
    stage: "campaign",
    error: null,
    messagingServiceSid: "MGservice",
    brandSid: "BNbrand",
  };

  it("creates the campaign with the given samples and marks complete", async () => {
    const result = await ensureCampaign(
      soleProInfo,
      ["Sample one message here", "Sample two message here"],
      "End users opt in on our site.",
      baseState,
    );
    expect(usAppToPersonCreate).toHaveBeenCalledWith(
      expect.objectContaining({ usAppToPersonUsecase: "SOLE_PROPRIETOR" }),
    );
    expect(result.campaignSid).toBe("QEcampaign");
    expect(result.stage).toBe("complete");
  });

  it("uses MIXED use case for the EIN path", async () => {
    await ensureCampaign(einInfo, ["a", "b"], "flow", baseState);
    expect(usAppToPersonCreate).toHaveBeenCalledWith(expect.objectContaining({ usAppToPersonUsecase: "MIXED" }));
  });

  it("never creates a second campaign once campaignSid is saved", async () => {
    await ensureCampaign(soleProInfo, ["a", "b"], "flow", { ...baseState, campaignSid: "QEexisting" });
    expect(usAppToPersonCreate).not.toHaveBeenCalled();
  });

  it("polls campaign status with a readable error", async () => {
    usAppToPersonFetch.mockResolvedValue({ campaignStatus: "FAILED", errors: [{ message: "Bad sample" }] });
    const result = await pollCampaignStatus("MGservice", "QEcampaign");
    expect(result).toEqual({ status: "FAILED", errorMessage: "Bad sample" });
  });

  it("uses MIXED for the same_entity path too", async () => {
    const sameEntityInfo = { ...soleProInfo, registrationType: "same_entity" as const };
    await ensureCampaign(sameEntityInfo, ["a", "b"], "flow", baseState);
    expect(usAppToPersonCreate).toHaveBeenCalledWith(expect.objectContaining({ usAppToPersonUsecase: "MIXED" }));
  });
});

describe("getSitewyrePrimaryBrandSid", () => {
  it("resolves the approved brand tied to the primary customer profile", async () => {
    const sid = await getSitewyrePrimaryBrandSid();
    expect(sid).toBe("BNprimarybrand");
  });

  it("ignores a brand tied to some other (non-primary) profile", async () => {
    brandRegistrationsList.mockResolvedValue([
      { sid: "BNother", customerProfileBundleSid: "BUsomeoneelse", status: "APPROVED" },
    ]);
    await expect(getSitewyrePrimaryBrandSid()).rejects.toThrow("No approved Sitewyre brand found");
  });

  it("ignores a brand on the primary profile that isn't approved yet", async () => {
    brandRegistrationsList.mockResolvedValue([
      { sid: "BNpending", customerProfileBundleSid: "BUprimary", status: "PENDING" },
    ]);
    await expect(getSitewyrePrimaryBrandSid()).rejects.toThrow("No approved Sitewyre brand found");
  });
});

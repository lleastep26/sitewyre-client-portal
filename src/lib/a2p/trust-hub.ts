import twilio from "twilio";

/**
 * Policy SIDs per Twilio's documented ISV onboarding API walkthroughs —
 * these are fixed values Twilio assigns to each registration path, not
 * account-specific, so they're safe to hardcode:
 * https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv-api
 * https://twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv-api-sole-prop-new
 */
export const POLICY = {
  einSecondaryProfile: "RNdfbf3fae0e1107f8aded0e7cead80bf5",
  einTrustBundle: "RNb0d4771c2c98518d916a3d4cd70a8f8b",
  soleProStarterProfile: "RN806dd6cd175f314e1f96a9727ee271f4",
  soleProTrustBundle: "RN670d5d2e282a6130ae063b234b6019c8",
};

export type A2pStage =
  | "customer_profile"
  | "trust_bundle"
  | "brand"
  | "otp_pending"
  | "messaging_service"
  | "attach_number"
  | "campaign"
  | "complete";

export type A2pPipelineState = {
  stage: A2pStage;
  error: string | null;
  customerProfileSid?: string;
  endUserBusinessSid?: string;
  endUserRepSid?: string;
  addressSid?: string;
  supportingDocSid?: string;
  trustBundleSid?: string;
  trustBundleEndUserSid?: string;
  brandSid?: string;
  brandType?: string;
  messagingServiceSid?: string;
  campaignSid?: string;
  otpVerifiedAt?: string;
  websiteCheckOk?: boolean;
  checklistConfirmedAt?: string;
};

export type A2pBusinessInfo = {
  registrationType: "sole_prop" | "low_volume_standard";
  legalBusinessName: string;
  businessEmail: string;
  phone: string;
  website: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  ownerName: string;
  /** Decrypted — only ever passed in at call time, never stored by this module. */
  ein?: string;
};

function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio credentials missing");
  return twilio(sid, token);
}

async function getPrimaryCustomerProfileSid(client: ReturnType<typeof twilio>): Promise<string> {
  const profiles = await client.trusthub.v1.customerProfiles.list({ limit: 20 });
  const primary = profiles.find((p) => p.status === "twilio-approved");
  if (!primary) throw new Error("Sitewyre's primary Trust Hub Customer Profile isn't approved");
  return primary.sid;
}

function extractErrorMessage(errors: Array<Record<string, unknown>> | undefined): string | null {
  if (!errors || errors.length === 0) return null;
  return errors
    .map((e) => (typeof e.message === "string" ? e.message : typeof e.description === "string" ? e.description : JSON.stringify(e)))
    .join("; ");
}

/** Stage 1: secondary (EIN path) or Starter (Sole Prop path) Customer Profile. */
export async function ensureCustomerProfile(
  info: A2pBusinessInfo,
  state: A2pPipelineState,
): Promise<A2pPipelineState> {
  const client = getTwilioClient();
  const next = { ...state };

  if (!next.customerProfileSid) {
    const policySid =
      info.registrationType === "sole_prop" ? POLICY.soleProStarterProfile : POLICY.einSecondaryProfile;
    const profile = await client.trusthub.v1.customerProfiles.create({
      friendlyName: `${info.legalBusinessName} Customer Profile`,
      email: info.businessEmail,
      policySid,
    });
    next.customerProfileSid = profile.sid;
  }

  if (!next.endUserBusinessSid) {
    const endUser =
      info.registrationType === "sole_prop"
        ? await client.trusthub.v1.endUsers.create({
            friendlyName: `${info.legalBusinessName} Starter Profile Contact`,
            type: "starter_customer_profile_information",
            attributes: {
              email: info.businessEmail,
              first_name: info.ownerName || info.legalBusinessName,
              last_name: "",
              phone_number: info.phone,
            },
          })
        : await client.trusthub.v1.endUsers.create({
            friendlyName: `${info.legalBusinessName} Business Information`,
            type: "customer_profile_business_information",
            attributes: {
              business_name: info.legalBusinessName,
              business_type: "Sole Proprietorship",
              business_registration_identifier: "EIN",
              business_registration_number: info.ein,
              business_industry: "OTHER",
              business_identity: "direct_customer",
              business_regions_of_operation: "USA_ONLY",
              website_url: info.website,
            },
          });
    next.endUserBusinessSid = endUser.sid;
    await client.trusthub.v1
      .customerProfiles(next.customerProfileSid)
      .customerProfilesEntityAssignments.create({ objectSid: endUser.sid });
  }

  if (info.registrationType === "low_volume_standard" && !next.endUserRepSid) {
    const [firstName, ...rest] = (info.ownerName || info.legalBusinessName).split(" ");
    const rep = await client.trusthub.v1.endUsers.create({
      friendlyName: `${info.legalBusinessName} Authorized Representative`,
      type: "authorized_representative_1",
      attributes: {
        first_name: firstName,
        last_name: rest.join(" ") || firstName,
        email: info.businessEmail,
        phone_number: info.phone,
        business_title: "Owner",
        job_position: "Owner",
      },
    });
    next.endUserRepSid = rep.sid;
    await client.trusthub.v1
      .customerProfiles(next.customerProfileSid)
      .customerProfilesEntityAssignments.create({ objectSid: rep.sid });
  }

  if (!next.addressSid) {
    const address = await client.addresses.create({
      customerName: info.legalBusinessName,
      street: info.addressLine1,
      city: info.city,
      region: info.state,
      postalCode: info.postalCode,
      isoCountry: info.country || "US",
    });
    next.addressSid = address.sid;
  }

  if (!next.supportingDocSid) {
    const doc = await client.trusthub.v1.supportingDocuments.create({
      friendlyName: `${info.legalBusinessName} Address Document`,
      type: "customer_profile_address",
      attributes: { address_sids: next.addressSid },
    });
    next.supportingDocSid = doc.sid;
    await client.trusthub.v1
      .customerProfiles(next.customerProfileSid)
      .customerProfilesEntityAssignments.create({ objectSid: doc.sid });
  }

  const primarySid = await getPrimaryCustomerProfileSid(client);
  await client.trusthub.v1
    .customerProfiles(next.customerProfileSid)
    .customerProfilesEntityAssignments.create({ objectSid: primarySid })
    .catch(() => undefined); // already-assigned is not an error worth failing the stage over

  const policySid =
    info.registrationType === "sole_prop" ? POLICY.soleProStarterProfile : POLICY.einSecondaryProfile;
  await client.trusthub.v1.customerProfiles(next.customerProfileSid).customerProfilesEvaluations.create({
    policySid,
  });
  await client.trusthub.v1.customerProfiles(next.customerProfileSid).update({ status: "pending-review" });

  next.stage = "trust_bundle";
  next.error = null;
  return next;
}

/** Stage 2: the A2P Trust Bundle (separate from the Customer Profile above). */
export async function ensureTrustBundle(
  info: A2pBusinessInfo,
  state: A2pPipelineState,
): Promise<A2pPipelineState> {
  const client = getTwilioClient();
  const next = { ...state };

  if (!next.trustBundleSid) {
    const policySid =
      info.registrationType === "sole_prop" ? POLICY.soleProTrustBundle : POLICY.einTrustBundle;
    const bundle = await client.trusthub.v1.trustProducts.create({
      friendlyName: `${info.legalBusinessName} A2P Trust Bundle`,
      email: info.businessEmail,
      policySid,
    });
    next.trustBundleSid = bundle.sid;
  }

  if (!next.trustBundleEndUserSid) {
    const endUser =
      info.registrationType === "sole_prop"
        ? await client.trusthub.v1.endUsers.create({
            friendlyName: `${info.legalBusinessName} Sole Proprietor Info`,
            type: "sole_proprietor_information",
            attributes: {
              brand_name: info.legalBusinessName,
              mobile_phone_number: info.phone,
            },
          })
        : await client.trusthub.v1.endUsers.create({
            friendlyName: `${info.legalBusinessName} Messaging Profile Info`,
            type: "us_a2p_messaging_profile_information",
            attributes: { company_type: "private" },
          });
    next.trustBundleEndUserSid = endUser.sid;
    await client.trusthub.v1
      .trustProducts(next.trustBundleSid)
      .trustProductsEntityAssignments.create({ objectSid: endUser.sid });
  }

  await client.trusthub.v1
    .trustProducts(next.trustBundleSid)
    .trustProductsEntityAssignments.create({ objectSid: next.customerProfileSid! })
    .catch(() => undefined);

  const policySid =
    info.registrationType === "sole_prop" ? POLICY.soleProTrustBundle : POLICY.einTrustBundle;
  await client.trusthub.v1.trustProducts(next.trustBundleSid).trustProductsEvaluations.create({ policySid });
  await client.trusthub.v1.trustProducts(next.trustBundleSid).update({ status: "pending-review" });

  next.stage = "brand";
  next.error = null;
  return next;
}

/** Stage 3: the Brand Registration itself (this is where TCR fees are incurred). */
export async function ensureBrand(
  info: A2pBusinessInfo,
  state: A2pPipelineState,
): Promise<A2pPipelineState> {
  const client = getTwilioClient();
  const next = { ...state };

  if (!next.brandSid) {
    const brand = await client.messaging.v1.brandRegistrations.create({
      customerProfileBundleSid: next.customerProfileSid!,
      a2PProfileBundleSid: next.trustBundleSid!,
      ...(info.registrationType === "sole_prop"
        ? { brandType: "SOLE_PROPRIETOR" }
        : { skipAutomaticSecVet: true }),
    });
    next.brandSid = brand.sid;
    next.brandType = brand.brandType;
  }

  next.stage = info.registrationType === "sole_prop" ? "otp_pending" : "brand";
  next.error = null;
  return next;
}

export type BrandPollResult = {
  status: string;
  identityStatus: string | null;
  errorMessage: string | null;
};

export async function pollBrandStatus(brandSid: string): Promise<BrandPollResult> {
  const client = getTwilioClient();
  const brand = await client.messaging.v1.brandRegistrations(brandSid).fetch();
  return {
    status: brand.status,
    identityStatus: brand.identityStatus ?? null,
    errorMessage: extractErrorMessage(brand.errors as Array<Record<string, unknown>>),
  };
}

export async function resendBrandOtp(brandSid: string): Promise<void> {
  const client = getTwilioClient();
  await client.messaging.v1.brandRegistrations(brandSid).brandRegistrationOtps.create();
}

/** Stage 4: a Messaging Service dedicated to this one client. */
export async function ensureMessagingService(
  info: A2pBusinessInfo,
  state: A2pPipelineState,
): Promise<A2pPipelineState> {
  const client = getTwilioClient();
  const next = { ...state };

  if (!next.messagingServiceSid) {
    const service = await client.messaging.v1.services.create({
      friendlyName: `${info.legalBusinessName} Messaging Service`,
    });
    next.messagingServiceSid = service.sid;
  }

  next.stage = "attach_number";
  next.error = null;
  return next;
}

/** Stage 5: attach the client's already-purchased number to their Messaging Service. */
export async function ensureNumberAttached(
  phoneNumberSid: string,
  state: A2pPipelineState,
): Promise<A2pPipelineState> {
  const client = getTwilioClient();
  const next = { ...state };

  await client.messaging.v1
    .services(next.messagingServiceSid!)
    .phoneNumbers.create({ phoneNumberSid })
    .catch((err: unknown) => {
      // Already attached is not a failure worth blocking the pipeline over.
      const message = err instanceof Error ? err.message : String(err);
      if (!/already exists|duplicate/i.test(message)) throw err;
    });

  next.stage = "campaign";
  next.error = null;
  return next;
}

/** Stage 6: the campaign (use-case) registration — this is where it gets vetted. */
export async function ensureCampaign(
  info: A2pBusinessInfo,
  sampleMessages: string[],
  messageFlow: string,
  state: A2pPipelineState,
): Promise<A2pPipelineState> {
  const client = getTwilioClient();
  const next = { ...state };

  if (!next.campaignSid) {
    const campaign = await client.messaging.v1.services(next.messagingServiceSid!).usAppToPerson.create({
      brandRegistrationSid: next.brandSid!,
      usAppToPersonUsecase: info.registrationType === "sole_prop" ? "SOLE_PROPRIETOR" : "MIXED",
      description:
        `${info.legalBusinessName} sends appointment confirmations, invoice/quote follow-ups, ` +
        `and replies to inbound leads for their home service business.`,
      messageSamples: sampleMessages,
      messageFlow,
      hasEmbeddedLinks: true,
      hasEmbeddedPhone: false,
    });
    next.campaignSid = campaign.sid;
  }

  next.stage = "complete";
  next.error = null;
  return next;
}

export type CampaignPollResult = { status: string; errorMessage: string | null };

export async function pollCampaignStatus(
  messagingServiceSid: string,
  campaignSid: string,
): Promise<CampaignPollResult> {
  const client = getTwilioClient();
  const campaign = await client.messaging.v1.services(messagingServiceSid).usAppToPerson(campaignSid).fetch();
  return {
    status: campaign.campaignStatus,
    errorMessage: extractErrorMessage(campaign.errors as Array<Record<string, unknown>>),
  };
}

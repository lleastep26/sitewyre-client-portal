/**
 * The ad and listing platforms on the Settings → Integrations tab.
 *
 * None of them makes a live API call yet. Each platform has to approve
 * Sitewyre's API access first; until its flag below is set to "true" on
 * Vercel, its card shows "Pending approval". Clients can still ask to be
 * connected, which is recorded so they can be set up once access lands.
 */
export const AD_PROVIDERS = [
  {
    id: "meta_ads",
    name: "Meta (Facebook and Instagram)",
    description: "Bring lead-ad leads straight into your pipeline and see what your ads cost per lead.",
    approvedFlag: "META_ADS_APPROVED",
  },
  {
    id: "google_lsa",
    name: "Google Local Services Ads",
    description: "Bring Local Services leads into your pipeline and track spend per lead.",
    approvedFlag: "GOOGLE_LSA_APPROVED",
  },
  {
    id: "google_business_profile",
    name: "Google Business Profile",
    description: "See your reviews and profile activity next to your leads.",
    approvedFlag: "GOOGLE_BUSINESS_PROFILE_APPROVED",
  },
] as const;

export type AdProviderId = (typeof AD_PROVIDERS)[number]["id"];

export function isAdProviderId(value: string): value is AdProviderId {
  return AD_PROVIDERS.some((p) => p.id === value);
}

export function isAdProviderApproved(id: AdProviderId): boolean {
  const provider = AD_PROVIDERS.find((p) => p.id === id);
  return provider ? process.env[provider.approvedFlag] === "true" : false;
}

export type IntegrationStatus = "disconnected" | "requested" | "connected";

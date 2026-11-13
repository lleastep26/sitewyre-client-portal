export type NicheLabels = {
  jobNounSingular: string;
  jobNounPlural: string;
  customerNoun: string;
};

export type TradePreset = {
  trade: string;
  labels: NicheLabels;
  stages: { name: string; position: number; is_won?: boolean; is_lost?: boolean }[];
  services: { name: string; duration_minutes: number; default_price: number }[];
  templates: { key: string; body: string }[];
};

const defaultStages = [
  { name: "New", position: 0 },
  { name: "Contacted", position: 1 },
  { name: "Quoted", position: 2 },
  { name: "Booked", position: 3 },
  { name: "Won", position: 4, is_won: true },
  { name: "Lost", position: 5, is_lost: true },
];

const contractorLabels: NicheLabels = {
  jobNounSingular: "Job",
  jobNounPlural: "Jobs",
  customerNoun: "customer",
};

export const TRADE_PRESETS: Record<string, TradePreset> = {
  roofing: {
    trade: "roofing",
    labels: contractorLabels,
    stages: defaultStages,
    services: [
      { name: "Roof inspection", duration_minutes: 60, default_price: 0 },
      { name: "Roof repair", duration_minutes: 180, default_price: 750 },
      { name: "Roof replacement", duration_minutes: 480, default_price: 12000 },
    ],
    templates: [
      {
        key: "lead_auto_reply",
        body: "Hi {{first_name}}, thanks for contacting {{business_name}}. We got your request and will reply shortly.",
      },
    ],
  },
  hvac: {
    trade: "hvac",
    labels: contractorLabels,
    stages: defaultStages,
    services: [
      { name: "Service call", duration_minutes: 90, default_price: 129 },
      { name: "Tune-up", duration_minutes: 90, default_price: 99 },
      { name: "Install consult", duration_minutes: 60, default_price: 0 },
    ],
    templates: [
      {
        key: "lead_auto_reply",
        body: "Hi {{first_name}}, {{business_name}} here — we received your HVAC request and will follow up ASAP.",
      },
    ],
  },
  plumbing: {
    trade: "plumbing",
    labels: contractorLabels,
    stages: defaultStages,
    services: [
      { name: "Service call", duration_minutes: 90, default_price: 125 },
      { name: "Water heater", duration_minutes: 180, default_price: 1200 },
      { name: "Drain clearing", duration_minutes: 90, default_price: 175 },
    ],
    templates: [
      {
        key: "lead_auto_reply",
        body: "Hi {{first_name}}, thanks for contacting {{business_name}}. A plumber will follow up shortly.",
      },
    ],
  },
  cleaning: {
    trade: "cleaning",
    labels: contractorLabels,
    stages: defaultStages,
    services: [
      { name: "Standard clean", duration_minutes: 120, default_price: 150 },
      { name: "Deep clean", duration_minutes: 240, default_price: 275 },
      { name: "Move-out clean", duration_minutes: 300, default_price: 350 },
    ],
    templates: [
      {
        key: "lead_auto_reply",
        body: "Hi {{first_name}}, thanks for reaching out to {{business_name}}. We'll confirm availability shortly.",
      },
    ],
  },
  landscaping: {
    trade: "landscaping",
    labels: contractorLabels,
    stages: defaultStages,
    services: [
      { name: "Lawn care visit", duration_minutes: 60, default_price: 55 },
      { name: "Landscape consult", duration_minutes: 60, default_price: 0 },
    ],
    templates: [
      {
        key: "lead_auto_reply",
        body: "Hi {{first_name}}, {{business_name}} got your request — we'll be in touch soon.",
      },
    ],
  },
  electrical: {
    trade: "electrical",
    labels: contractorLabels,
    stages: defaultStages,
    services: [
      { name: "Service call", duration_minutes: 90, default_price: 150 },
      { name: "Panel upgrade consult", duration_minutes: 60, default_price: 0 },
    ],
    templates: [
      {
        key: "lead_auto_reply",
        body: "Hi {{first_name}}, thanks for contacting {{business_name}}. An electrician will follow up shortly.",
      },
    ],
  },
  painting: {
    trade: "painting",
    labels: contractorLabels,
    stages: defaultStages,
    services: [
      { name: "Interior estimate", duration_minutes: 60, default_price: 0 },
      { name: "Exterior estimate", duration_minutes: 60, default_price: 0 },
    ],
    templates: [
      {
        key: "lead_auto_reply",
        body: "Hi {{first_name}}, {{business_name}} received your painting request. We'll reply soon.",
      },
    ],
  },
  general_contractor: {
    trade: "general_contractor",
    labels: contractorLabels,
    stages: defaultStages,
    services: [
      { name: "Project consult", duration_minutes: 60, default_price: 0 },
      { name: "Remodel estimate", duration_minutes: 90, default_price: 0 },
    ],
    templates: [
      {
        key: "lead_auto_reply",
        body: "Hi {{first_name}}, thanks for contacting {{business_name}}. We'll review your project and follow up.",
      },
    ],
  },
  med_spa: {
    trade: "med_spa",
    labels: {
      jobNounSingular: "Appointment",
      jobNounPlural: "Appointments",
      customerNoun: "client",
    },
    stages: defaultStages,
    services: [
      { name: "Consultation", duration_minutes: 30, default_price: 0 },
      { name: "Treatment", duration_minutes: 60, default_price: 150 },
    ],
    templates: [
      {
        key: "lead_auto_reply",
        body: "Hi {{first_name}}, thanks for reaching out to {{business_name}}. We'll confirm your appointment shortly.",
      },
    ],
  },
  veterinary: {
    trade: "veterinary",
    labels: {
      jobNounSingular: "Appointment",
      jobNounPlural: "Appointments",
      customerNoun: "pet owner",
    },
    stages: defaultStages,
    services: [
      { name: "Checkup", duration_minutes: 30, default_price: 65 },
      { name: "Sick visit", duration_minutes: 30, default_price: 85 },
    ],
    templates: [
      {
        key: "lead_auto_reply",
        body: "Hi {{first_name}}, thanks for contacting {{business_name}}. We'll confirm your pet's appointment shortly.",
      },
    ],
  },
  // Generic fallback for anything that isn't a specific trade/niche above.
  other: {
    trade: "other",
    labels: contractorLabels,
    stages: defaultStages,
    services: [
      { name: "Estimate walkthrough", duration_minutes: 60, default_price: 0 },
      { name: "Repair or service visit", duration_minutes: 60, default_price: 0 },
      { name: "Quick consult", duration_minutes: 30, default_price: 0 },
    ],
    templates: [
      {
        key: "lead_auto_reply",
        body: "Hi {{first_name}}, thanks for contacting {{business_name}}. We'll get back to you shortly.",
      },
    ],
  },
};

export function getTradePreset(trade: string): TradePreset {
  const key = trade.trim().toLowerCase().replace(/\s+/g, "_");
  return TRADE_PRESETS[key] ?? TRADE_PRESETS.other;
}

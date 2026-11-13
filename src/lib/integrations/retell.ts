import Retell, { verify as verifyRetellSignatureRaw } from "retell-sdk";

/**
 * Mid-tier on purpose: Retell's "recommended" standard-tier model, not the
 * cheapest (GPT 5 nano / GPT 6 Luna) and not a flagship. Swap this one
 * constant to change the model for every client.
 */
const DEFAULT_RETELL_MODEL = "gpt-6.1-terra";

/** A Retell platform voice (the lowest TTS price tier). Override with
 * RETELL_VOICE_ID to use any other voice id from the Retell dashboard. */
const DEFAULT_RETELL_VOICE_ID = "retell-Cimo";

function getClient(): Retell {
  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RETELL_API_KEY missing — add it to .env.local and Vercel before enabling the AI receptionist.",
    );
  }
  return new Retell({ apiKey });
}

export type RetellFunctionUrls = {
  checkAvailability: string;
  bookAppointment: string;
  upsertLead: string;
  flagEmergency: string;
};

function buildGeneralTools(urls: RetellFunctionUrls) {
  return [
    {
      type: "custom" as const,
      name: "check_availability",
      description:
        "Check open appointment slots for a given service and date range before offering a time to the caller.",
      url: urls.checkAvailability,
      parameters: {
        type: "object" as const,
        properties: {
          service_name: { type: "string", description: "The bookable service the caller wants." },
          earliest: { type: "string", description: "Earliest acceptable date/time, ISO 8601." },
        },
        required: ["service_name"],
      },
    },
    {
      type: "custom" as const,
      name: "book_appointment",
      description: "Book an appointment once the caller has agreed to a specific time.",
      url: urls.bookAppointment,
      parameters: {
        type: "object" as const,
        properties: {
          service_name: { type: "string", description: "The bookable service." },
          start_at: { type: "string", description: "Appointment start time, ISO 8601." },
          caller_name: { type: "string", description: "The caller's name." },
          caller_phone: { type: "string", description: "The caller's phone number." },
        },
        required: ["service_name", "start_at", "caller_name"],
      },
    },
    {
      type: "custom" as const,
      name: "create_or_update_lead",
      description:
        "Record or update this caller as a lead — call this as soon as you have their name and reason for calling, even if they don't book.",
      url: urls.upsertLead,
      parameters: {
        type: "object" as const,
        properties: {
          caller_name: { type: "string", description: "The caller's name." },
          caller_phone: { type: "string", description: "The caller's phone number." },
          reason: { type: "string", description: "Why they're calling, in their own words." },
        },
        required: ["caller_name"],
      },
    },
    {
      type: "custom" as const,
      name: "flag_emergency",
      description:
        "Call this immediately if the caller describes a genuine emergency (e.g. active flooding, gas smell, fire, safety danger). Tell them to call 911 first if there is any danger to life. This alerts the owner.",
      url: urls.flagEmergency,
      parameters: {
        type: "object" as const,
        properties: {
          summary: { type: "string", description: "One sentence describing the emergency." },
        },
        required: ["summary"],
      },
    },
  ];
}

export async function createRetellAgent(opts: {
  generalPrompt: string;
  beginMessage: string;
  functionUrls: RetellFunctionUrls;
  agentName: string;
  webhookUrl: string;
}): Promise<{ llmId: string; agentId: string }> {
  const client = getClient();
  const llm = await client.llm.create({
    general_prompt: opts.generalPrompt,
    begin_message: opts.beginMessage,
    general_tools: buildGeneralTools(opts.functionUrls),
    model_config: { type: "cascading", primary: { model: DEFAULT_RETELL_MODEL } },
  });
  const agent = await client.agent.create({
    response_engine: { type: "retell-llm", llm_id: llm.llm_id },
    voice_id: process.env.RETELL_VOICE_ID || DEFAULT_RETELL_VOICE_ID,
    agent_name: opts.agentName,
    webhook_url: opts.webhookUrl,
    webhook_events: ["call_started", "call_ended", "call_analyzed"],
  });
  return { llmId: llm.llm_id, agentId: agent.agent_id };
}

/** Best-effort push of a refreshed prompt — callers should swallow errors. */
export async function updateRetellAgentPrompt(
  llmId: string,
  generalPrompt: string,
  beginMessage: string,
): Promise<void> {
  const client = getClient();
  await client.llm.update(llmId, {
    general_prompt: generalPrompt,
    begin_message: beginMessage,
  });
}

/** The caller's number in a form the agent can read aloud ("405-555-0123"),
 * or "unknown" when caller ID is withheld or isn't a US number. */
export function spokenCallerNumber(fromNumber: string): string {
  const digits = fromNumber.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (digits.length !== 10) return "unknown";
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export async function registerRetellPhoneCall(opts: {
  agentId: string;
  fromNumber: string;
  toNumber: string;
  metadata: Record<string, string>;
  /** The real caller's number when it isn't `fromNumber` (a forwarded call
   * whose caller ID is the business's own line); "" when it isn't known. */
  callerNumber?: string;
}): Promise<{ callId: string }> {
  const client = getClient();
  const call = await client.call.registerPhoneCall({
    agent_id: opts.agentId,
    direction: "inbound",
    from_number: opts.fromNumber,
    to_number: opts.toNumber,
    metadata: opts.metadata,
    // Lets the prompt read the caller's number back to them ({{caller_number}}).
    retell_llm_dynamic_variables: {
      caller_number: spokenCallerNumber(opts.callerNumber ?? opts.fromNumber),
    },
  });
  return { callId: call.call_id };
}

/** Dial-to-SIP-URI handoff (Retell's "custom telephony" method 2) — must be
 * dialed within 5 minutes of registerRetellPhoneCall or it times out. */
export function retellSipUri(callId: string): string {
  return `sip:${callId}@sip.retellai.com;transport=tcp`;
}

/** Verifies the X-Retell-Signature header against the raw request body.
 * Must be called with the exact raw body text — never a re-serialized
 * JSON.stringify(parsed body), which Retell's HMAC will not match. */
export async function verifyRetellSignature(
  rawBody: string,
  signature: string | null,
): Promise<boolean> {
  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey || !signature) return false;
  return verifyRetellSignatureRaw(rawBody, apiKey, signature);
}

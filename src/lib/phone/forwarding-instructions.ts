/**
 * What a client dials on their own business phone to forward unanswered
 * calls to their Sitewyre number. Shown in Settings > Phone.
 *
 * Verizon's codes come from Verizon's support pages and T-Mobile's from
 * T-Mobile's short-codes page. AT&T's own pages don't list wireless
 * codes, so AT&T's are shown as unconfirmed until tried on a real line.
 */

export type ForwardingCarrier = "verizon" | "tmobile" | "att" | "other";

export const FORWARDING_CARRIERS: { id: ForwardingCarrier; label: string }[] = [
  { id: "verizon", label: "Verizon" },
  { id: "tmobile", label: "T-Mobile" },
  { id: "att", label: "AT&T" },
  { id: "other", label: "Landline or another provider" },
];

export type ForwardingStep = { label: string; code: string };

export type ForwardingGuide = {
  carrier: ForwardingCarrier;
  label: string;
  /** True when the codes aren't confirmed by the carrier's own pages. */
  unconfirmed: boolean;
  turnOn: ForwardingStep[];
  turnOff: ForwardingStep[];
  notes: string[];
};

/** "+14055550123" -> "4055550123"; "" when it isn't a US number. */
function tenDigits(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return digits.length === 10 ? digits : "";
}

export function formatUsPhone(phone: string | null | undefined): string {
  const d = tenDigits(phone);
  return d ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : (phone ?? "");
}

const DIAL_NOTE =
  "Dial the code on the phone whose number you're forwarding, then press Call.";

export function forwardingGuide(
  carrier: ForwardingCarrier,
  sitewyreNumber: string | null | undefined,
): ForwardingGuide {
  const d = tenDigits(sitewyreNumber);
  const label = FORWARDING_CARRIERS.find((c) => c.id === carrier)?.label ?? "";

  if (carrier === "verizon") {
    return {
      carrier,
      label,
      unconfirmed: false,
      turnOn: [
        { label: "Forward calls you don't answer, or that come in while you're on the phone", code: `*71${d}` },
      ],
      turnOff: [{ label: "Turn forwarding off", code: "*73" }],
      notes: [
        DIAL_NOTE,
        "You'll hear a confirmation tone. You can also manage forwarding in My Verizon.",
      ],
    };
  }

  if (carrier === "tmobile" || carrier === "att") {
    const gsm: ForwardingStep[] = [
      { label: "Forward calls you don't answer", code: `**61*1${d}#` },
      { label: "Forward calls that come in while you're on the phone", code: `**67*1${d}#` },
      { label: "Forward calls when your phone is off or has no signal", code: `**62*1${d}#` },
    ];
    if (carrier === "tmobile") {
      return {
        carrier,
        label,
        unconfirmed: false,
        turnOn: [
          ...gsm,
          {
            label: "Optional: choose how long your phone rings first (5 to 30 seconds, in steps of 5; this example is 20)",
            code: `**61*1${d}**20#`,
          },
        ],
        turnOff: [
          { label: "Turn off all three", code: "##004#" },
          { label: "Or one at a time", code: "##61#  ##67#  ##62#" },
        ],
        notes: [DIAL_NOTE, "Dial all three turn-on codes so every unanswered call is covered."],
      };
    }
    return {
      carrier,
      label,
      unconfirmed: true,
      turnOn: [{ label: "Forward all unanswered, busy and unreachable calls at once", code: `**004*1${d}#` }, ...gsm],
      turnOff: [{ label: "Turn forwarding off", code: "##004#" }],
      notes: [
        "These are the codes most guides list for AT&T mobile phones, but AT&T's own support pages don't confirm them.",
        "If a code doesn't work, set call forwarding in your phone's settings or ask AT&T to turn on busy / no answer forwarding. AT&T home phone lines: call 800.288.2020.",
        DIAL_NOTE,
      ],
    };
  }

  return {
    carrier,
    label,
    unconfirmed: false,
    turnOn: [],
    turnOff: [],
    notes: [
      `Ask your phone provider to turn on "call forwarding, busy and no answer" to ${formatUsPhone(sitewyreNumber) || "your Sitewyre number"}.`,
      "Don't choose \"forward all calls\": your phone would stop ringing and every call would go straight to the AI receptionist.",
      "To stop, ask them to turn call forwarding off.",
    ],
  };
}

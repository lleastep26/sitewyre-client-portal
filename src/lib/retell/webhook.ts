import { verifyRetellSignature } from "@/lib/integrations/retell";

export type RetellFunctionCallBody = {
  name: string;
  args: Record<string, unknown>;
  call: {
    call_id: string;
    agent_id: string;
    metadata?: Record<string, unknown>;
  };
};

/** Reads and verifies a Retell webhook/function-call request against its
 * raw body — never re-serialize the parsed JSON, the signature won't
 * match. Returns the raw text on success, null on a bad/missing signature. */
export async function readVerifiedRetellBody(request: Request): Promise<string | null> {
  const raw = await request.text();
  const signature = request.headers.get("x-retell-signature");
  const verified = await verifyRetellSignature(raw, signature);
  return verified ? raw : null;
}

/** The client_id travels in signed call metadata set at
 * registerRetellPhoneCall time — never trusted from a URL/query param. */
export function clientIdFromCall(call: RetellFunctionCallBody["call"]): string | null {
  const id = call.metadata?.client_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function jsonResult(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

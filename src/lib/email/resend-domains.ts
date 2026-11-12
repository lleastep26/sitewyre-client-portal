import { Resend } from "resend";
import { resolveTxt } from "dns/promises";

export type EmailDnsRecord = {
  record: string;
  type: string;
  name: string;
  value: string;
  status: "pending" | "verified" | "failed" | "temporary_failure" | "not_started";
  priority?: number;
};

const DMARC_VALUE = "v=DMARC1; p=none; rua=mailto:dmarc-reports@sitewyre.systems";

function getResendClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY missing");
  return new Resend(key);
}

/**
 * Resend's domain API never provisions or checks DMARC — it's not part of
 * their verification flow — so this is built and checked independently,
 * via a real DNS lookup, not just shown as a static recommendation.
 */
export async function buildDmarcRecord(domain: string): Promise<EmailDnsRecord> {
  const name = `_dmarc.${domain}`;
  let status: EmailDnsRecord["status"] = "not_started";
  try {
    const records = await resolveTxt(name);
    const found = records.some((r) => r.join("").toLowerCase().startsWith("v=dmarc1"));
    status = found ? "verified" : "pending";
  } catch {
    status = "not_started";
  }
  return { record: "DMARC", type: "TXT", name, value: DMARC_VALUE, status };
}

export async function createEmailDomain(
  domain: string,
): Promise<{ id: string; status: string; records: EmailDnsRecord[] }> {
  const resend = getResendClient();
  const { data, error } = await resend.domains.create({ name: domain });
  if (error || !data) throw new Error(error?.message ?? "Resend domain creation failed");

  const dmarc = await buildDmarcRecord(domain);
  return {
    id: data.id,
    status: data.status,
    records: [...(data.records as EmailDnsRecord[]), dmarc],
  };
}

/** Kicks off re-verification with Resend, then reads back the fresh
 * status — `verify()` itself only confirms the request was received, not
 * the resulting status. */
export async function refreshEmailDomain(
  resendId: string,
  domain: string,
): Promise<{ status: string; records: EmailDnsRecord[] }> {
  const resend = getResendClient();
  await resend.domains.verify(resendId).catch(() => undefined);

  const { data, error } = await resend.domains.get(resendId);
  if (error || !data) throw new Error(error?.message ?? "Couldn't read domain status");

  const dmarc = await buildDmarcRecord(domain);
  return {
    status: data.status,
    records: [...(data.records as EmailDnsRecord[]), dmarc],
  };
}

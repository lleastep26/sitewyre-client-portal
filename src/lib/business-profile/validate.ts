import { z } from "zod";
import { normalizeHost, normalizePhone } from "@/lib/utils";

// Full E.164 allows 8-15 digits total; the lower bound here is tightened
// to 8 digits minimum so obviously-too-short input (e.g. "12345") doesn't
// pass just because normalizePhone happens to prefix it with "+".
const E164_RE = /^\+[1-9]\d{7,14}$/;
const HOSTNAME_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

export function isValidE164Phone(raw: string): boolean {
  return E164_RE.test(normalizePhone(raw));
}

export function isValidDomain(raw: string): boolean {
  return HOSTNAME_RE.test(normalizeHost(raw));
}

export function isValidWebsiteUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const url = trimmed.includes("://") ? new URL(trimmed) : new URL(`https://${trimmed}`);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      HOSTNAME_RE.test(url.hostname)
    );
  } catch {
    return false;
  }
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""));

export const businessProfileSchema = z.object({
  business_name: optionalText(200),
  legal_business_name: optionalText(200),
  owner_name: optionalText(200),
  business_email: z
    .string()
    .trim()
    .email("Enter a valid business email")
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || isValidE164Phone(v), "Enter a valid business phone number"),
  website: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || isValidWebsiteUrl(v), "Enter a valid website URL"),
  domain: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || isValidDomain(v), "Enter a valid domain"),
  trade: optionalText(60),
  address_line1: optionalText(200),
  city: optionalText(120),
  state: optionalText(2),
  postal_code: optionalText(20),
  country: optionalText(2),
  timezone: optionalText(60),
});

export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;

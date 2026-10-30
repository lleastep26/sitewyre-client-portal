import { z } from "zod";

export const leadIngestSchema = z.object({
  site_key: z.string().min(1).optional(),
  client_id: z.string().uuid().optional(),
  domain: z.string().optional(),
  business_name: z.string().optional(),
  name: z.string().min(1),
  phone: z.string().min(7),
  email: z.string().email().optional().or(z.literal("")),
  message: z.string().min(1),
  source: z.string().optional(),
  service: z.string().optional(),
  turnstile_token: z.string().optional(),
  sms_opt_in: z.boolean().optional(),
  consent_text: z.string().optional(),
});

export type LeadIngest = z.infer<typeof leadIngestSchema>;

export const reviewIngestSchema = z.object({
  site_key: z.string().min(1).optional(),
  client_id: z.string().uuid().optional(),
  domain: z.string().optional(),
  business_name: z.string().optional(),
  rating: z.coerce.number().int().min(1).max(5),
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  feedback: z.string().optional(),
  routed_to_google: z.boolean().optional(),
});

export const createAccountSchema = z.object({
  business_name: z.string().min(1),
  trade: z.string().min(1),
  service_area: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email(),
  domain: z.string().optional(),
  live_site_url: z.string().optional(),
  brand_colors: z.record(z.string(), z.string()).optional(),
  timezone: z.string().optional(),
  owner_user_id: z.string().uuid().optional(),
  area_code: z.string().optional(),
});

import { applyTemplate } from "@/lib/automations";

/**
 * The first review-blast text. If the owner has customized the template,
 * it's used as-is (owner's responsibility to word it sensibly — same
 * convention as every other customizable automation in this app) with a
 * guaranteed {{review_link}}. Otherwise, the built-in default reads
 * naturally whether or not job_type/owner_name are present — it's not
 * just a template with a blank left in it.
 */
export function buildReviewBlastMessage(params: {
  firstName: string;
  businessName: string;
  ownerName: string | null;
  jobType: string | null;
  reviewLink: string;
  customTemplate: string | null;
}): string {
  const { firstName, businessName, ownerName, jobType, reviewLink, customTemplate } =
    params;

  if (customTemplate) {
    const body = applyTemplate(customTemplate, {
      first_name: firstName,
      business_name: businessName,
      owner_name: ownerName ?? businessName,
      job_type: jobType ?? "",
      review_link: reviewLink,
    });
    return customTemplate.includes("{{review_link}}")
      ? body
      : `${body} ${reviewLink}`.trim();
  }

  const who = ownerName ? `${ownerName} from ${businessName}` : businessName;
  const workPhrase = jobType
    ? `We did your ${jobType} a while back`
    : "We worked with you a while back";
  return `Hi ${firstName}, it's ${who}. ${workPhrase} and would really appreciate a quick Google review: ${reviewLink}. Reply STOP to opt out.`;
}

/** The single +3-day reminder, short and friendly — no STOP language
 * repeated, since the first text already covered it. */
export function buildReviewBlastReminderMessage(params: {
  firstName: string;
  businessName: string;
  reviewLink: string;
}): string {
  return `Hi ${params.firstName}, just a quick follow-up from ${params.businessName} — we'd really appreciate your review: ${params.reviewLink}`;
}

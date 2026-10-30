export function applyReplyVariables(
  template: string,
  vars: {
    first_name?: string;
    business_name?: string;
    phone?: string;
    booking_link?: string;
    review_link?: string;
  },
) {
  return template
    .replaceAll("{{first_name}}", vars.first_name ?? "")
    .replaceAll("{{business_name}}", vars.business_name ?? "")
    .replaceAll("{{phone}}", vars.phone ?? "")
    .replaceAll("{{booking_link}}", vars.booking_link ?? "")
    .replaceAll("{{review_link}}", vars.review_link ?? "");
}

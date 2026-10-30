export function applyReplyVariables(
  template: string,
  vars: {
    first_name?: string;
    business_name?: string;
    phone?: string;
  },
) {
  return template
    .replaceAll("{{first_name}}", vars.first_name ?? "")
    .replaceAll("{{business_name}}", vars.business_name ?? "")
    .replaceAll("{{phone}}", vars.phone ?? "");
}

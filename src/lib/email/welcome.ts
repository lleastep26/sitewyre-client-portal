export function welcomeEmailHtml({
  businessName,
  loginUrl,
}: {
  businessName: string | null;
  loginUrl: string;
}): string {
  return `
    <p>Your Sitewyre portal is ready${businessName ? ` for ${businessName}` : ""}.</p>
    <p>
      <a
        href="${loginUrl}"
        style="display:inline-block;background:#b5651d;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;"
      >
        Sign in to your portal
      </a>
    </p>
    <p>If the button doesn't work, copy and paste this link: ${loginUrl}</p>
  `;
}

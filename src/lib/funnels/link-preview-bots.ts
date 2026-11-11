/**
 * Known link-unfurling bots that fetch a URL automatically to build a
 * chat/social preview — these should still be redirected (so the preview
 * card looks right) but must never count as a real click.
 *
 * This is necessarily incomplete: some preview fetchers (notably Apple's
 * iMessage link preview) don't send a distinctive User-Agent and can be
 * indistinguishable from a genuine click by request shape alone. The HEAD
 * vs GET method check (see src/app/r/[token]/route.ts) catches a separate
 * class of previewer that this list can't.
 */
const BOT_USER_AGENT_PATTERNS = [
  /facebookexternalhit/i,
  /Facebot/i,
  /Twitterbot/i,
  /WhatsApp/i,
  /Slackbot/i,
  /Googlebot/i,
  /Google-PageRenderer/i,
  /LinkedInBot/i,
  /TelegramBot/i,
  /Discordbot/i,
  /SkypeUriPreview/i,
  /redditbot/i,
  /Pinterest/i,
  /vkShare/i,
];

export function isLikelyLinkPreviewBot(userAgent: string): boolean {
  if (!userAgent) return false;
  return BOT_USER_AGENT_PATTERNS.some((pattern) => pattern.test(userAgent));
}

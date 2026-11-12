/**
 * Twilio campaign vetting commonly rejects brands whose website doesn't
 * load, so this is checked live at submit time rather than trusting that
 * the client typed a working URL into Business Profile.
 */
export async function checkWebsiteReachable(url: string): Promise<boolean> {
  const target = url.includes("://") ? url : `https://${url}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(target, { method: "GET", signal: controller.signal, redirect: "follow" });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

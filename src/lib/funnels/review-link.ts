/**
 * Prefer the owner's manually-entered google_review_url; fall back to
 * Google's well-known direct-review-link format derived from
 * google_place_id. Returns null when neither is configured — callers
 * should treat that as "no review destination", not guess a URL.
 */
export function resolveGoogleReviewUrl(client: {
  google_review_url: string | null;
  google_place_id?: string | null;
}): string | null {
  if (client.google_review_url) return client.google_review_url;
  if (client.google_place_id) {
    return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(client.google_place_id)}`;
  }
  return null;
}

import { describe, expect, it } from "vitest";
import { resolveGoogleReviewUrl } from "@/lib/funnels/review-link";
import { isLikelyLinkPreviewBot } from "@/lib/funnels/link-preview-bots";

describe("resolveGoogleReviewUrl", () => {
  it("prefers the owner's google_review_url when set", () => {
    expect(
      resolveGoogleReviewUrl({
        google_review_url: "https://g.page/r/test",
        google_place_id: "ChIJabc",
      }),
    ).toBe("https://g.page/r/test");
  });

  it("derives a review link from google_place_id when the URL is empty", () => {
    expect(
      resolveGoogleReviewUrl({ google_review_url: null, google_place_id: "ChIJabc" }),
    ).toBe("https://search.google.com/local/writereview?placeid=ChIJabc");
  });

  it("returns null when neither is configured", () => {
    expect(
      resolveGoogleReviewUrl({ google_review_url: null, google_place_id: null }),
    ).toBeNull();
  });
});

describe("isLikelyLinkPreviewBot", () => {
  it("matches known link-unfurling bots", () => {
    expect(isLikelyLinkPreviewBot("facebookexternalhit/1.1")).toBe(true);
    expect(
      isLikelyLinkPreviewBot("Mozilla/5.0 (compatible; Slackbot-LinkExpanding 1.0)"),
    ).toBe(true);
    expect(isLikelyLinkPreviewBot("Twitterbot/1.0")).toBe(true);
    expect(isLikelyLinkPreviewBot("WhatsApp/2.23")).toBe(true);
    expect(isLikelyLinkPreviewBot("Googlebot/2.1")).toBe(true);
  });

  it("does not match a normal browser user agent", () => {
    expect(
      isLikelyLinkPreviewBot(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      ),
    ).toBe(false);
  });

  it("does not match an empty user agent", () => {
    expect(isLikelyLinkPreviewBot("")).toBe(false);
  });
});

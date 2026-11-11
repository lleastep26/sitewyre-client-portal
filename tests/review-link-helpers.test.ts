import { describe, expect, it } from "vitest";
import { buildReviewMessage, resolveGoogleReviewUrl } from "@/lib/funnels/review-link";
import { isLikelyLinkPreviewBot } from "@/lib/funnels/link-preview-bots";

describe("buildReviewMessage", () => {
  it("substitutes {{review_link}} when the template has the placeholder", () => {
    const body = buildReviewMessage(
      "Hi {{first_name}}: {{review_link}}",
      { first_name: "Sam" },
      "https://example.com/r/tok",
    );
    expect(body).toBe("Hi Sam: https://example.com/r/tok");
  });

  it("appends the link when the template has no placeholder, so it is never dropped", () => {
    const body = buildReviewMessage(
      "Thanks, {{first_name}}!",
      { first_name: "Sam" },
      "https://example.com/r/tok",
    );
    expect(body).toBe("Thanks, Sam! https://example.com/r/tok");
  });
});

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

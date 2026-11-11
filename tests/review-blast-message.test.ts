import { describe, expect, it } from "vitest";
import {
  buildReviewBlastMessage,
  buildReviewBlastReminderMessage,
} from "@/lib/funnels/review-blast-message";

describe("buildReviewBlastMessage", () => {
  it("includes both owner_name and job_type when both are present", () => {
    const body = buildReviewBlastMessage({
      firstName: "Sam",
      businessName: "Acme Cleaning",
      ownerName: "Pat",
      jobType: "deep clean",
      reviewLink: "https://example.com/r/tok",
      customTemplate: null,
    });
    expect(body).toBe(
      "Hi Sam, it's Pat from Acme Cleaning. We did your deep clean a while back and would really appreciate a quick Google review: https://example.com/r/tok. Reply STOP to opt out.",
    );
  });

  it("falls back to natural wording when job_type is blank", () => {
    const body = buildReviewBlastMessage({
      firstName: "Sam",
      businessName: "Acme Cleaning",
      ownerName: "Pat",
      jobType: null,
      reviewLink: "https://example.com/r/tok",
      customTemplate: null,
    });
    expect(body).toContain("We worked with you a while back");
    expect(body).not.toContain("undefined");
  });

  it("uses just the business name when owner_name is blank", () => {
    const body = buildReviewBlastMessage({
      firstName: "Sam",
      businessName: "Acme Cleaning",
      ownerName: null,
      jobType: "deep clean",
      reviewLink: "https://example.com/r/tok",
      customTemplate: null,
    });
    expect(body.startsWith("Hi Sam, it's Acme Cleaning.")).toBe(true);
    expect(body).not.toContain("from Acme Cleaning");
  });

  it("falls back fully when both are blank", () => {
    const body = buildReviewBlastMessage({
      firstName: "Sam",
      businessName: "Acme Cleaning",
      ownerName: null,
      jobType: null,
      reviewLink: "https://example.com/r/tok",
      customTemplate: null,
    });
    expect(body).toBe(
      "Hi Sam, it's Acme Cleaning. We worked with you a while back and would really appreciate a quick Google review: https://example.com/r/tok. Reply STOP to opt out.",
    );
  });

  it("uses the owner's custom template when set, substituting the link", () => {
    const body = buildReviewBlastMessage({
      firstName: "Sam",
      businessName: "Acme Cleaning",
      ownerName: "Pat",
      jobType: "deep clean",
      reviewLink: "https://example.com/r/tok",
      customTemplate: "Hey {{first_name}}! {{review_link}}",
    });
    expect(body).toBe("Hey Sam! https://example.com/r/tok");
  });

  it("appends the link to a custom template that lacks the placeholder", () => {
    const body = buildReviewBlastMessage({
      firstName: "Sam",
      businessName: "Acme Cleaning",
      ownerName: "Pat",
      jobType: "deep clean",
      reviewLink: "https://example.com/r/tok",
      customTemplate: "Hey {{first_name}}!",
    });
    expect(body).toBe("Hey Sam! https://example.com/r/tok");
  });
});

describe("buildReviewBlastReminderMessage", () => {
  it("includes the first name, business name, and link", () => {
    const body = buildReviewBlastReminderMessage({
      firstName: "Sam",
      businessName: "Acme Cleaning",
      reviewLink: "https://example.com/r/tok",
    });
    expect(body).toContain("Sam");
    expect(body).toContain("Acme Cleaning");
    expect(body).toContain("https://example.com/r/tok");
  });
});

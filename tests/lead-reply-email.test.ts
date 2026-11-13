import { describe, expect, it, vi } from "vitest";
import { sendLeadReplyEmail } from "@/lib/leads/reply-email";

const input = { to: "jo@example.com", subject: "We got your request", html: "<p>Hi</p>", text: "Hi" };

describe("sendLeadReplyEmail", () => {
  it("reports a sent email", async () => {
    const send = vi.fn().mockResolvedValue({ id: "em1" });
    expect(await sendLeadReplyEmail({ send }, input)).toEqual({ sent: true });
    expect(send).toHaveBeenCalledWith(input);
  });

  it("reports a rejected address instead of throwing, so the rest of the lead's workflow still runs", async () => {
    const send = vi.fn().mockRejectedValue(new Error("Invalid `to` field."));
    expect(await sendLeadReplyEmail({ send }, input)).toEqual({ sent: false, error: "Invalid `to` field." });
  });
});

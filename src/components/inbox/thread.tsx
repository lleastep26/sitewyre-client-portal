"use client";

import { useState, useTransition } from "react";
import {
  sendInboxMessage,
  suggestReply,
  createSavedReply,
  deleteSavedReply,
} from "@/app/(app)/inbox/actions";
import { applyReplyVariables } from "@/lib/inbox/variables";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

type Message = {
  id: string;
  channel: string;
  direction: string;
  body: string | null;
  created_at: string;
};

type SavedReply = {
  id: string;
  title: string;
  body: string;
};

export function InboxThread({
  contactId,
  contactName,
  businessName,
  phone,
  email,
  bookingLink,
  reviewLink,
  messages,
  savedReplies,
}: {
  contactId: string;
  contactName: string;
  businessName: string;
  phone?: string | null;
  email?: string | null;
  bookingLink?: string | null;
  reviewLink?: string | null;
  messages: Message[];
  savedReplies: SavedReply[];
}) {
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<"sms" | "email" | "note">(
    phone ? "sms" : email ? "email" : "note",
  );
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const firstName = contactName.trim().split(/\s+/)[0] ?? contactName;

  function insertReply(template: string) {
    setBody(
      applyReplyVariables(template, {
        first_name: firstName,
        business_name: businessName,
        phone: phone ?? "",
        booking_link: bookingLink ?? "",
        review_link: reviewLink ?? "",
      }),
    );
  }

  return (
    <div className="flex h-[70dvh] flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-2">
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.direction === "outbound" || m.direction === "internal"
                ? "ml-8 rounded-lg bg-copper/15 p-3 text-sm"
                : "mr-8 rounded-lg bg-white p-3 text-sm shadow-sm"
            }
          >
            <p className="text-[10px] uppercase text-charcoal/50">
              {m.channel} · {m.direction}
            </p>
            <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
          </div>
        ))}
      </div>
      <div className="border-t border-charcoal/10 bg-white/90 p-3">
        <div className="mb-2 flex flex-wrap gap-1">
          {savedReplies.map((r) => (
            <button
              key={r.id}
              type="button"
              className="rounded-md bg-charcoal/5 px-2 py-1 text-[11px] text-charcoal/80"
              onClick={() => insertReply(r.body)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (confirm(`Delete saved reply “${r.title}”?`)) {
                  start(() => {
                    void deleteSavedReply(r.id);
                  });
                }
              }}
              title="Click to insert · right-click to delete"
            >
              {r.title}
            </button>
          ))}
          <button
            type="button"
            className="rounded-md px-2 py-1 text-[11px] text-copper"
            onClick={() => setShowNew((v) => !v)}
          >
            + Save
          </button>
        </div>

        {showNew ? (
          <form
            className="mb-2 space-y-1 rounded-md border border-charcoal/10 p-2"
            action={(fd) => {
              start(async () => {
                const res = await createSavedReply(fd);
                if (res.error) setError(res.error);
                else setShowNew(false);
              });
            }}
          >
            <Input name="title" placeholder="Title" required />
            <Textarea
              name="body"
              placeholder="Body — {{first_name}} {{business_name}} {{booking_link}} {{review_link}}"
              required
            />
            <Button type="submit" size="sm" disabled={pending}>
              Save reply
            </Button>
          </form>
        ) : null}

        <div className="mb-2 flex gap-2">
          {(["sms", "email", "note"] as const).map((c) => (
            <button
              key={c}
              type="button"
              className={`rounded-md px-2 py-1 text-xs ${channel === c ? "bg-copper text-white" : "bg-charcoal/10"}`}
              onClick={() => setChannel(c)}
            >
              {c}
            </button>
          ))}
          <button
            type="button"
            className="ml-auto text-xs text-copper"
            onClick={() =>
              start(async () => {
                const ctx = messages
                  .slice(-6)
                  .map((m) => `${m.direction}: ${m.body}`)
                  .join("\n");
                const res = await suggestReply(ctx);
                setBody(res.suggestion);
              })
            }
          >
            AI suggest
          </button>
        </div>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type a reply…"
        />
        {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
        <Button
          className="mt-2 w-full"
          disabled={pending || !body.trim()}
          onClick={() =>
            start(async () => {
              const res = await sendInboxMessage({
                contactId,
                channel,
                body,
                phone,
                email,
              });
              if (res.error) setError(res.error);
              else {
                setBody("");
                setError(null);
              }
            })
          }
        >
          Send
        </Button>
      </div>
    </div>
  );
}

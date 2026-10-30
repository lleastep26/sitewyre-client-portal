"use client";

import { useState, useTransition } from "react";
import { sendInboxMessage, suggestReply } from "@/app/(app)/inbox/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Message = {
  id: string;
  channel: string;
  direction: string;
  body: string | null;
  created_at: string;
};

export function InboxThread({
  contactId,
  phone,
  email,
  messages,
}: {
  contactId: string;
  phone?: string | null;
  email?: string | null;
  messages: Message[];
}) {
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<"sms" | "email" | "note">(
    phone ? "sms" : email ? "email" : "note",
  );
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

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

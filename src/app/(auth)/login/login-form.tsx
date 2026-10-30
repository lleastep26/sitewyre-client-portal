"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendPhoneOtp, verifyPhoneOtp } from "./actions";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [message, setMessage] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4 rounded-xl border border-charcoal/10 bg-white/80 p-5 shadow-sm">
      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === "email" ? "default" : "secondary"}
          className="flex-1"
          onClick={() => setMode("email")}
        >
          Email link
        </Button>
        <Button
          type="button"
          variant={mode === "phone" ? "default" : "secondary"}
          className="flex-1"
          onClick={() => setMode("phone")}
        >
          Text code
        </Button>
      </div>

      {mode === "email" ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const email = String(fd.get("email") ?? "").trim();
            if (!email) {
              setMessage("Email required");
              return;
            }
            startTransition(async () => {
              const supabase = createBrowserSupabaseClient();
              const redirectTo = `${window.location.origin}/auth/callback`;
              const { error } = await supabase.auth.signInWithOtp({
                email,
                options: { emailRedirectTo: redirectTo },
              });
              setMessage(
                error
                  ? error.message
                  : "Check your email for a login link. Open it in this same browser.",
              );
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required placeholder="you@company.com" />
          </div>
          <Button className="w-full" disabled={pending}>
            {pending ? "Sending…" : "Send magic link"}
          </Button>
        </form>
      ) : awaitingCode ? (
        <form
          className="space-y-3"
          action={(fd) => {
            startTransition(async () => {
              const res = await verifyPhoneOtp(fd);
              if (res?.error) setMessage(res.error);
            });
          }}
        >
          <input type="hidden" name="phone" value={phone} />
          <div className="space-y-1.5">
            <Label htmlFor="token">Code</Label>
            <Input id="token" name="token" inputMode="numeric" required placeholder="123456" />
          </div>
          <Button className="w-full" disabled={pending}>
            {pending ? "Verifying…" : "Verify code"}
          </Button>
        </form>
      ) : (
        <form
          className="space-y-3"
          action={(fd) => {
            startTransition(async () => {
              const res = await sendPhoneOtp(fd);
              if (res.error) setMessage(res.error);
              else {
                setPhone(String(fd.get("phone") ?? ""));
                setAwaitingCode(true);
                setMessage("Code sent. Enter it below.");
              }
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" type="tel" required placeholder="+1…" />
          </div>
          <Button className="w-full" disabled={pending}>
            {pending ? "Sending…" : "Send code"}
          </Button>
        </form>
      )}

      {message ? <p className="text-sm text-charcoal/70">{message}</p> : null}
    </div>
  );
}

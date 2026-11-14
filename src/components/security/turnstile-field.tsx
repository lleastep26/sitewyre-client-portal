"use client";

import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      size?: "normal" | "flexible" | "compact";
    },
  ) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Loads Cloudflare's script once per page, however many forms use it. */
function loadTurnstile(): Promise<TurnstileApi> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile did not load"));
    });
    script.addEventListener("error", () => reject(new Error("Turnstile did not load")));
  });
}

/**
 * The Turnstile bot check for a form hosted by the portal. Renders
 * nothing when `siteKey` is null (Turnstile not set up). The answer goes
 * into a hidden `turnstile_token` field, which the form's server action
 * checks. An answer can only be used once, so the form re-mounts this
 * (with a new `key`) after a failed submit.
 */
export function TurnstileField({ siteKey }: { siteKey: string | null }) {
  const holder = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!siteKey || !holder.current) return;
    let widgetId: string | null = null;
    let cancelled = false;
    const container = holder.current;

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled) return;
        widgetId = turnstile.render(container, {
          sitekey: siteKey,
          size: "flexible",
          callback: (value) => {
            setFailed(false);
            setToken(value);
          },
          "expired-callback": () => setToken(""),
          "error-callback": () => setFailed(true),
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  if (!siteKey) return null;

  return (
    <div>
      <div ref={holder} />
      <input type="hidden" name="turnstile_token" value={token} />
      {failed ? (
        <p className="mt-1 text-xs text-red-600" role="alert">
          The security check didn&apos;t load. Refresh the page and try again, or call us instead.
        </p>
      ) : null}
    </div>
  );
}

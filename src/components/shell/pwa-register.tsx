"use client";

import { useEffect } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const meta = await fetch("/api/push/subscribe").then((r) => r.json());
        if (cancelled || !meta?.configured || !meta.publicKey) return;

        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const existing = await reg.pushManager.getSubscription();
        const sub =
          existing ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(meta.publicKey),
          }));

        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        });
      } catch {
        /* push optional */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}

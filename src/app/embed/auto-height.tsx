"use client";

import { useEffect } from "react";

/**
 * Tells the page this frame sits in how tall its content is, so the
 * Sitewyre script there can size the frame to fit (no inner scrollbar).
 * Only a height is sent, and it's harmless if nobody is listening.
 */
export function EmbedAutoHeight() {
  useEffect(() => {
    if (window.parent === window) return;
    const send = () => {
      window.parent.postMessage(
        { type: "sitewyre:height", height: Math.ceil(document.documentElement.scrollHeight) },
        "*",
      );
    };
    send();
    const observer = new ResizeObserver(send);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);
  return null;
}

"use client";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-3 px-4 py-8">
      <p className="text-xs uppercase tracking-[0.2em] text-copper">Settings</p>
      <h1 className="font-display text-3xl">Couldn’t load settings</h1>
      <p className="text-sm text-charcoal/70">
        {error.message || "Something went wrong rendering this page."}
      </p>
      {error.digest ? (
        <p className="text-xs text-charcoal/45">Digest: {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-copper px-4 py-2 text-sm text-white"
      >
        Try again
      </button>
    </div>
  );
}

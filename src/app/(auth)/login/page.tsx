import { LoginForm } from "./login-form";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  return (
    <main className="min-h-dvh bg-[radial-gradient(ellipse_at_top,_#f7f1ea,_#ebe4da_55%,_#e2d6c6)] px-4 py-10">
      <div className="mx-auto flex min-h-[80dvh] w-full max-w-md flex-col justify-center">
        <p className="font-display text-xs uppercase tracking-[0.22em] text-copper">
          Sitewyre
        </p>
        <h1 className="mt-3 font-display text-4xl text-charcoal">Client Portal</h1>
        <p className="mt-2 text-sm text-charcoal/70">
          Sign in with a magic link or text code. No password needed.
        </p>
        <div className="mt-8">
          <LoginForm />
        </div>
        <LoginError searchParams={searchParams} />
      </div>
    </main>
  );
}

async function LoginError({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  const params = await searchParams;
  if (!params.error) return null;
  const detail = params.detail ? decodeURIComponent(params.detail) : null;
  return (
    <p className="mt-4 text-sm text-red-700">
      {params.error === "no_membership"
        ? "No portal membership found for this login. Use an owner email tied to a client account."
        : detail
          ? `Could not sign you in: ${detail}`
          : "Could not sign you in. Try again, and open the magic link in the same browser."}
    </p>
  );
}

/** QuickBooks Online one-way sync stubs (Phase 3). */

export function getQuickBooksAuthUrl(state: string) {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const redirect = process.env.QUICKBOOKS_REDIRECT_URI;
  if (!clientId || !redirect) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting",
    state,
  });
  return `https://appcenter.intuit.com/connect/oauth2?${params}`;
}

export async function syncInvoiceToQuickBooks(input: {
  realmId: string;
  accessToken: string;
  invoice: { number: string; total: number; customerName: string };
}) {
  // Implement QBO Invoice create in Phase 3 pilot.
  void input;
  return { ok: true as const, skipped: true };
}

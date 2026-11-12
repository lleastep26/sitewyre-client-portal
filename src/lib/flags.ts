export function onlinePaymentsEnabled(): boolean {
  return process.env.ONLINE_PAYMENTS_ENABLED === "true";
}

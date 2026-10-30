import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!secret || !key) {
    return Response.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const stripe = new Stripe(key);
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createAdminClient();

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object as Stripe.PaymentIntent;
    const invoiceId = intent.metadata?.invoice_id;
    if (invoiceId) {
      const amount = (intent.amount_received ?? intent.amount) / 100;
      const { data: invoice } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .maybeSingle();
      if (invoice) {
        const paid = Number(invoice.amount_paid) + amount;
        await supabase
          .from("invoices")
          .update({
            amount_paid: paid,
            status: paid >= Number(invoice.total) ? "paid" : "partial",
            stripe_payment_intent_id: intent.id,
          })
          .eq("id", invoiceId);
      }
    }
  }

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    await supabase
      .from("clients")
      .update({
        stripe_subscription_id: sub.id,
        status: sub.status === "active" ? "active" : sub.status,
      })
      .eq("stripe_customer_id", String(sub.customer));
  }

  return Response.json({ received: true });
}

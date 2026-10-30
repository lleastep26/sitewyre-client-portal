import { Card, CardDescription, CardTitle } from "@/components/ui/card";

const articles = [
  {
    title: "Reply to a new lead",
    body: "Open Inbox or Leads, tap the contact, send a text. Speed-to-lead timer stops on first human reply.",
  },
  {
    title: "Move a lead through the pipeline",
    body: "On Leads, drag the card to Contacted → Quoted → Booked. Lost requires a reason.",
  },
  {
    title: "Book a job",
    body: "Use Calendar or share your public booking link from Settings / Calendar.",
  },
  {
    title: "Get paid",
    body: "Connect Stripe in Settings, create a quote, convert to job, then invoice with a pay link.",
  },
];

export default function HelpPage() {
  return (
    <div className="space-y-4 px-4">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-copper">Help</p>
        <h1 className="mt-1 font-display text-3xl">Guides</h1>
      </header>
      {articles.map((a) => (
        <Card key={a.title}>
          <CardTitle>{a.title}</CardTitle>
          <CardDescription className="mt-2">{a.body}</CardDescription>
        </Card>
      ))}
      <p className="text-sm text-charcoal/60">
        Stuck? Use Get help on any screen. Mark urgent for leads or texts not working.
      </p>
    </div>
  );
}

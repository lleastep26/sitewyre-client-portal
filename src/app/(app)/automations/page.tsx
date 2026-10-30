import Link from "next/link";
import { requireMembership } from "@/lib/auth/session";
import {
  AUTOMATION_DEFS,
  ensureClientAutomations,
} from "@/lib/automations";
import { AutomationToggle } from "./toggle";
import { setAutomationTemplate } from "./actions";
import { Button } from "@/components/ui/button";

export default async function AutomationsPage() {
  const { supabase, client } = await requireMembership();
  if (!client) return null;

  await ensureClientAutomations(supabase, client.id).catch(() => undefined);

  const [{ data: settings }, { data: runs }] = await Promise.all([
    supabase
      .from("client_automations")
      .select("trigger, enabled, template_body")
      .eq("client_id", client.id),
    supabase
      .from("workflow_runs")
      .select("id, trigger, status, log, created_at")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const byKey = new Map(
    (settings ?? []).map((s) => [s.trigger, s] as const),
  );

  return (
    <div className="space-y-4 px-4 pb-8">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-copper">
          Automations
        </p>
        <h1 className="mt-1 font-display text-3xl">Workflows</h1>
        <p className="mt-1 text-sm text-charcoal/70">
          Built-in workflows for {client.business_name}. Quiet hours 9pm–8am (
          {client.timezone ?? "America/Chicago"}).
        </p>
        <Link href="/more" className="mt-1 inline-block text-sm text-copper">
          ← More
        </Link>
      </header>

      <ul className="space-y-3">
        {AUTOMATION_DEFS.map((item) => {
          const row = byKey.get(item.key);
          const enabled = row?.enabled !== false;
          const template =
            row?.template_body ?? item.defaultTemplate ?? "";
          return (
            <li
              key={item.key}
              className="rounded-xl border border-charcoal/10 bg-white p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">{item.label}</p>
                <AutomationToggle trigger={item.key} enabled={enabled} />
              </div>
              {item.defaultTemplate != null ? (
                <form
                  action={async (fd) => {
                    await setAutomationTemplate(fd);
                  }}
                  className="mt-3 space-y-2"
                >
                  <input type="hidden" name="trigger" value={item.key} />
                  <textarea
                    name="template_body"
                    defaultValue={template}
                    rows={2}
                    className="w-full rounded-md border border-charcoal/15 px-3 py-2 text-xs"
                    placeholder="SMS / email template ({{first_name}}, {{business_name}})"
                  />
                  <Button type="submit" size="sm" variant="secondary">
                    Save template
                  </Button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>

      <section>
        <h2 className="font-display text-xl">Recent runs</h2>
        <ul className="mt-2 space-y-2">
          {(runs ?? []).map((run) => (
            <li
              key={run.id}
              className="rounded-lg border border-charcoal/10 bg-white p-3 text-sm"
            >
              <p className="font-medium">{run.trigger}</p>
              <p className="text-xs text-charcoal/60">
                {run.status} · {new Date(run.created_at).toLocaleString()}
              </p>
            </li>
          ))}
          {!runs?.length ? (
            <p className="text-sm text-charcoal/60">No workflow runs yet.</p>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

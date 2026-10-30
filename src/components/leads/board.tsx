"use client";

import { useMemo, useState, useTransition } from "react";
import { moveLead } from "@/app/(app)/leads/actions";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Stage = {
  id: string;
  name: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
};

type Lead = {
  id: string;
  name: string;
  phone: string;
  service: string | null;
  value: number | null;
  source: string | null;
  stage_id: string | null;
  last_activity_at: string | null;
  created_at: string;
};

function daysInStage(lead: Lead) {
  const base = lead.last_activity_at ?? lead.created_at;
  return Math.floor((Date.now() - new Date(base).getTime()) / 86400000);
}

export function LeadsBoard({
  stages,
  leads,
}: {
  stages: Stage[];
  leads: Lead[];
}) {
  const [pending, start] = useTransition();
  const [dragLead, setDragLead] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byStage = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const s of stages) map.set(s.id, []);
    for (const l of leads) {
      if (l.stage_id && map.has(l.stage_id)) map.get(l.stage_id)!.push(l);
    }
    return map;
  }, [stages, leads]);

  return (
    <div className="space-y-3">
      {error ? <p className="px-4 text-sm text-red-700">{error}</p> : null}
      <div className="flex gap-3 overflow-x-auto px-4 pb-2 touch-pan-x">
        {stages.map((stage) => {
          const column = byStage.get(stage.id) ?? [];
          const total = column.reduce((sum, l) => sum + Number(l.value ?? 0), 0);
          return (
            <section
              key={stage.id}
              className="min-w-[260px] flex-1 rounded-xl border border-charcoal/10 bg-white/70 p-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (!dragLead) return;
                start(async () => {
                  let lostReason: string | undefined;
                  let value: number | undefined;
                  if (stage.is_lost) {
                    lostReason =
                      window.prompt("Lost reason?") ?? undefined;
                    if (!lostReason) {
                      setError("Lost reason required");
                      return;
                    }
                  }
                  if (stage.is_won) {
                    const raw = window.prompt("Job value (dollars)?", "0");
                    value = Number(raw ?? 0);
                  }
                  const res = await moveLead({
                    leadId: dragLead,
                    stageId: stage.id,
                    lostReason,
                    value,
                  });
                  setError(res.error ?? null);
                  setDragLead(null);
                });
              }}
            >
              <header className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium">{stage.name}</h2>
                <Badge>
                  {column.length} · ${total.toLocaleString()}
                </Badge>
              </header>
              <ul className="space-y-2">
                {column.map((lead) => {
                  const days = daysInStage(lead);
                  const stale = days > 2;
                  return (
                    <li
                      key={lead.id}
                      draggable
                      onDragStart={() => setDragLead(lead.id)}
                      className={cn(
                        "cursor-grab rounded-lg border bg-white p-3 active:cursor-grabbing",
                        stale ? "border-red-400" : "border-charcoal/10",
                        pending && dragLead === lead.id && "opacity-50",
                      )}
                    >
                      <p className="font-medium">{lead.name}</p>
                      <p className="text-xs text-charcoal/60">
                        {lead.service ?? "Service TBD"} · {lead.source ?? "—"}
                      </p>
                      <p className="mt-1 text-xs text-charcoal/50">
                        {days}d in stage
                        {lead.value != null ? ` · $${Number(lead.value).toLocaleString()}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

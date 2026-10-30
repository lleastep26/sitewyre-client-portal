"use client";

import { useMemo, useState, useTransition } from "react";
import { addMinutes, format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createAppointment,
  rescheduleAppointment,
  updateAppointmentStatus,
} from "./actions";
import type { MemberOption, WeekAppt } from "./week-calendar";

const HOUR_START = 7;
const HOUR_END = 19;

function toLocalInput(d: Date) {
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

export function DayCalendar({
  dayIso,
  prevHref,
  nextHref,
  weekHref,
  appointments,
  members,
}: {
  dayIso: string;
  prevHref: string;
  nextHref: string;
  weekHref: string;
  appointments: WeekAppt[];
  members: MemberOption[];
}) {
  const day = parseISO(dayIso);
  const hours = Array.from(
    { length: HOUR_END - HOUR_START },
    (_, i) => HOUR_START + i,
  );
  const lanes = useMemo(() => {
    const ids = new Set<string>();
    for (const m of members) ids.add(m.user_id);
    for (const a of appointments) {
      for (const id of a.assignee_ids ?? []) ids.add(id);
    }
    const list = [...ids];
    if (!list.length) list.push("unassigned");
    return list;
  }, [members, appointments]);

  const [draft, setDraft] = useState<{
    mode: "create" | "edit";
    id?: string;
    title: string;
    start_at: string;
    end_at: string;
    assignee_id: string;
    status: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openCreate(hour: number, assigneeId: string) {
    const start = new Date(day);
    start.setHours(hour, 0, 0, 0);
    setDraft({
      mode: "create",
      title: "Appointment",
      start_at: toLocalInput(start),
      end_at: toLocalInput(addMinutes(start, 60)),
      assignee_id: assigneeId === "unassigned" ? "" : assigneeId,
      status: "scheduled",
    });
    setError(null);
  }

  function openEdit(appt: WeekAppt) {
    setDraft({
      mode: "edit",
      id: appt.id,
      title: appt.title ?? "Appointment",
      start_at: toLocalInput(new Date(appt.start_at)),
      end_at: toLocalInput(new Date(appt.end_at)),
      assignee_id: appt.assignee_ids?.[0] ?? "",
      status: appt.status,
    });
    setError(null);
  }

  function save() {
    if (!draft) return;
    startTransition(async () => {
      if (draft.mode === "create") {
        const fd = new FormData();
        fd.set("title", draft.title);
        fd.set("start_at", new Date(draft.start_at).toISOString());
        fd.set("end_at", new Date(draft.end_at).toISOString());
        if (draft.assignee_id) fd.set("assignee_id", draft.assignee_id);
        const result = await createAppointment(fd);
        if (result?.error) {
          setError(result.error);
          return;
        }
      } else if (draft.id) {
        const result = await rescheduleAppointment({
          id: draft.id,
          title: draft.title,
          start_at: new Date(draft.start_at).toISOString(),
          end_at: new Date(draft.end_at).toISOString(),
          assignee_id: draft.assignee_id || null,
          status: draft.status,
        });
        if (result?.error) {
          setError(result.error);
          return;
        }
      }
      setDraft(null);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-3 text-sm">
          <a href={prevHref} className="text-copper">
            ← Prev
          </a>
          <a href={weekHref} className="text-copper">
            Week
          </a>
          <a href={nextHref} className="text-copper">
            Next →
          </a>
        </div>
        <p className="font-display text-xl">{format(day, "EEE MMM d")}</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-charcoal/10 bg-white">
        <div
          className="grid min-w-[640px]"
          style={{
            gridTemplateColumns: `56px repeat(${lanes.length}, minmax(140px, 1fr))`,
          }}
        >
          <div className="border-b border-charcoal/10 p-2 text-xs text-charcoal/50">
            Time
          </div>
          {lanes.map((id) => (
            <div
              key={id}
              className="border-b border-l border-charcoal/10 p-2 text-xs font-medium"
            >
              {id === "unassigned"
                ? "Unassigned"
                : members.find((m) => m.user_id === id)?.role ??
                  id.slice(0, 8)}
            </div>
          ))}

          {hours.map((hour) => (
            <div key={hour} className="contents">
              <div className="border-b border-charcoal/5 px-2 py-3 text-xs text-charcoal/50">
                {`${((hour + 11) % 12) + 1}${hour < 12 ? "am" : "pm"}`}
              </div>
              {lanes.map((laneId) => {
                const cellAppts = appointments.filter((a) => {
                  const start = new Date(a.start_at);
                  const assignee = a.assignee_ids?.[0] ?? "unassigned";
                  return (
                    start.getHours() === hour &&
                    (laneId === "unassigned"
                      ? !a.assignee_ids?.length
                      : assignee === laneId)
                  );
                });
                return (
                  <button
                    key={`${laneId}-${hour}`}
                    type="button"
                    className="min-h-14 border-b border-l border-charcoal/5 p-1 text-left hover:bg-copper/5"
                    onClick={() => {
                      if (cellAppts[0]) openEdit(cellAppts[0]);
                      else openCreate(hour, laneId);
                    }}
                  >
                    {cellAppts.map((a) => (
                      <span
                        key={a.id}
                        className="mb-1 block rounded bg-copper/15 px-1.5 py-1 text-xs"
                      >
                        {a.title ?? "Appt"} · {a.status}
                      </span>
                    ))}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {draft ? (
        <div className="space-y-2 rounded-xl border bg-white p-4">
          <p className="font-medium">
            {draft.mode === "create" ? "New appointment" : "Edit appointment"}
          </p>
          <Input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="Title"
          />
          <Input
            type="datetime-local"
            value={draft.start_at}
            onChange={(e) => setDraft({ ...draft, start_at: e.target.value })}
          />
          <Input
            type="datetime-local"
            value={draft.end_at}
            onChange={(e) => setDraft({ ...draft, end_at: e.target.value })}
          />
          <select
            className="w-full rounded-md border border-charcoal/15 px-3 py-2 text-sm"
            value={draft.assignee_id}
            onChange={(e) =>
              setDraft({ ...draft, assignee_id: e.target.value })
            }
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.role} · {m.user_id.slice(0, 8)}
              </option>
            ))}
          </select>
          {draft.mode === "edit" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    if (!draft.id) return;
                    await updateAppointmentStatus(draft.id, "cancelled");
                    setDraft(null);
                  })
                }
              >
                Cancel appt
              </Button>
            </div>
          ) : null}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="button" disabled={pending} onClick={save}>
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setDraft(null)}
            >
              Close
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

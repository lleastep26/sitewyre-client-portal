"use client";

import { useState, useTransition } from "react";
import {
  addDays,
  addMinutes,
  differenceInMinutes,
  format,
  isSameDay,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createAppointment,
  rescheduleAppointment,
  updateAppointmentStatus,
} from "./actions";

export type WeekAppt = {
  id: string;
  title: string | null;
  start_at: string;
  end_at: string;
  status: string;
  assignee_ids: string[];
};

export type MemberOption = {
  user_id: string;
  role: string;
};

const HOUR_START = 7;
const HOUR_END = 19;
const ROW_H = 44;
const DAY_H = (HOUR_END - HOUR_START) * ROW_H;

function toLocalInput(d: Date) {
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

export function WeekCalendar({
  weekStartIso,
  prevHref,
  nextHref,
  appointments,
  members,
}: {
  weekStartIso: string;
  prevHref: string;
  nextHref: string;
  appointments: WeekAppt[];
  members: MemberOption[];
}) {
  const weekStart = new Date(weekStartIso);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from(
    { length: HOUR_END - HOUR_START },
    (_, i) => HOUR_START + i,
  );

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

  function openCreate(day: Date, hour: number) {
    const start = new Date(day);
    start.setHours(hour, 0, 0, 0);
    setDraft({
      mode: "create",
      title: "Appointment",
      start_at: toLocalInput(start),
      end_at: toLocalInput(addMinutes(start, 60)),
      assignee_id: members[0]?.user_id ?? "",
      status: "scheduled",
    });
    setError(null);
  }

  function openEdit(a: WeekAppt) {
    setDraft({
      mode: "edit",
      id: a.id,
      title: a.title ?? "Appointment",
      start_at: toLocalInput(new Date(a.start_at)),
      end_at: toLocalInput(new Date(a.end_at)),
      assignee_id: a.assignee_ids?.[0] ?? members[0]?.user_id ?? "",
      status: a.status,
    });
    setError(null);
  }

  function submitDraft(formData: FormData) {
    setError(null);
    startTransition(async () => {
      if (draft?.mode === "create") {
        const result = await createAppointment(formData);
        if (result?.error) setError(result.error);
        else setDraft(null);
      } else if (draft?.mode === "edit" && draft.id) {
        const result = await rescheduleAppointment({
          id: draft.id,
          start_at: new Date(String(formData.get("start_at"))).toISOString(),
          end_at: new Date(String(formData.get("end_at"))).toISOString(),
          title: String(formData.get("title") ?? ""),
          assignee_id: String(formData.get("assignee_id") ?? "") || null,
          status: String(formData.get("status") ?? "scheduled"),
        });
        if (result?.error) setError(result.error);
        else setDraft(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <a
          href={prevHref}
          className="inline-flex h-9 items-center rounded-md border border-charcoal/20 px-3 text-sm hover:bg-charcoal/5"
        >
          ← Prev
        </a>
        <p className="text-sm font-medium">
          {format(weekStart, "MMM d")} –{" "}
          {format(addDays(weekStart, 6), "MMM d, yyyy")}
        </p>
        <a
          href={nextHref}
          className="inline-flex h-9 items-center rounded-md border border-charcoal/20 px-3 text-sm hover:bg-charcoal/5"
        >
          Next →
        </a>
      </div>

      <div className="overflow-x-auto rounded-xl border border-charcoal/10 bg-white">
        <div
          className="grid min-w-[740px]"
          style={{ gridTemplateColumns: `40px repeat(7, minmax(0, 1fr))` }}
        >
          <div className="border-b border-charcoal/10" />
          {days.map((d) => (
            <div
              key={d.toISOString()}
              className="border-b border-l border-charcoal/10 px-1 py-2 text-center text-xs font-medium"
            >
              {format(d, "EEE d")}
            </div>
          ))}

          <div className="relative" style={{ height: DAY_H }}>
            {hours.map((hour, i) => (
              <div
                key={hour}
                className="absolute right-1 text-[10px] text-charcoal/45"
                style={{ top: i * ROW_H + 2 }}
              >
                {format(new Date(2000, 0, 1, hour), "ha")}
              </div>
            ))}
          </div>

          {days.map((d) => {
            const dayAppts = appointments.filter(
              (a) =>
                a.status !== "cancelled" &&
                isSameDay(new Date(a.start_at), d),
            );
            return (
              <div
                key={d.toISOString()}
                className="relative border-l border-charcoal/10"
                style={{ height: DAY_H }}
              >
                {hours.map((hour, i) => (
                  <button
                    key={hour}
                    type="button"
                    className="absolute inset-x-0 border-b border-charcoal/5 hover:bg-copper/5"
                    style={{ top: i * ROW_H, height: ROW_H }}
                    onClick={() => openCreate(d, hour)}
                    aria-label={`Add at ${hour}:00 ${format(d, "MMM d")}`}
                  />
                ))}
                {dayAppts.map((a) => {
                  const start = new Date(a.start_at);
                  const end = new Date(a.end_at);
                  const minutesFromStart =
                    (start.getHours() - HOUR_START) * 60 + start.getMinutes();
                  const dur = Math.max(differenceInMinutes(end, start), 30);
                  const top = (minutesFromStart / 60) * ROW_H;
                  const height = Math.min(
                    (dur / 60) * ROW_H,
                    DAY_H - Math.max(top, 0),
                  );
                  if (top >= DAY_H || height <= 0) return null;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className="absolute left-0.5 right-0.5 z-10 overflow-hidden rounded bg-copper px-1 py-0.5 text-left text-[10px] leading-tight text-white shadow-sm"
                      style={{ top: Math.max(top, 0), height }}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(a);
                      }}
                    >
                      <span className="block truncate">{a.title ?? "Appt"}</span>
                      <span className="opacity-80">{format(start, "h:mm a")}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {draft ? (
        <form
          action={submitDraft}
          className="space-y-2 rounded-xl border border-charcoal/10 bg-white p-4"
        >
          <p className="text-sm font-medium">
            {draft.mode === "create" ? "New appointment" : "Edit appointment"}
          </p>
          <Input name="title" defaultValue={draft.title} required />
          <Input
            name="start_at"
            type="datetime-local"
            defaultValue={draft.start_at}
            required
          />
          <Input
            name="end_at"
            type="datetime-local"
            defaultValue={draft.end_at}
            required
          />
          <select
            name="assignee_id"
            defaultValue={draft.assignee_id}
            className="h-11 w-full rounded-md border border-charcoal/20 bg-white px-3 text-sm"
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.role} · {m.user_id.slice(0, 8)}
              </option>
            ))}
          </select>
          {draft.mode === "edit" ? (
            <select
              name="status"
              defaultValue={draft.status}
              className="h-11 w-full rounded-md border border-charcoal/20 bg-white px-3 text-sm"
            >
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No show</option>
            </select>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDraft(null)}
            >
              Close
            </Button>
          </div>
          {draft.mode === "edit" && draft.id ? (
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await updateAppointmentStatus(
                    draft.id!,
                    "cancelled",
                  );
                  if (result?.error) setError(result.error);
                  else setDraft(null);
                });
              }}
            >
              Cancel appointment
            </Button>
          ) : null}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}

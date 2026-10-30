import { addDays, format, parseISO, startOfDay, startOfWeek } from "date-fns";
import { requireMembership } from "@/lib/auth/session";
import { ensureDefaultAvailability } from "@/lib/scheduling/availability";
import { WeekCalendar } from "./week-calendar";
import { DayCalendar } from "./day-calendar";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; day?: string; view?: string; new?: string }>;
}) {
  const params = await searchParams;
  const { supabase, client, user } = await requireMembership();
  if (!client) return null;

  const ownerId = client.user_id ?? user.id;
  await ensureDefaultAvailability(supabase, client.id, ownerId).catch(
    () => undefined,
  );

  const view = params.view === "day" ? "day" : "week";
  const dayStart = params.day
    ? startOfDay(parseISO(params.day))
    : startOfDay(new Date());
  const weekStart = params.week
    ? startOfWeek(parseISO(params.week), { weekStartsOn: 1 })
    : startOfWeek(dayStart, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 7);
  const prevWeek = format(addDays(weekStart, -7), "yyyy-MM-dd");
  const nextWeek = format(addDays(weekStart, 7), "yyyy-MM-dd");
  const weekParam = format(weekStart, "yyyy-MM-dd");
  const dayParam = format(dayStart, "yyyy-MM-dd");
  const prevDay = format(addDays(dayStart, -1), "yyyy-MM-dd");
  const nextDay = format(addDays(dayStart, 1), "yyyy-MM-dd");
  const rangeStart = view === "day" ? dayStart : weekStart;
  const rangeEnd = view === "day" ? addDays(dayStart, 1) : weekEnd;

  const { data: appointments } = await supabase
    .from("appointments")
    .select("id, title, start_at, end_at, status, assignee_ids")
    .eq("client_id", client.id)
    .gte("start_at", rangeStart.toISOString())
    .lt("start_at", rangeEnd.toISOString())
    .order("start_at", { ascending: true });

  const { data: members } = await supabase
    .from("memberships")
    .select("user_id, role")
    .eq("client_id", client.id);

  return (
    <div className="space-y-4 px-4 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-copper">
            Calendar
          </p>
          <h1 className="mt-1 font-display text-3xl">Schedule</h1>
          <p className="mt-1 text-sm text-charcoal/60">
            {view === "day" ? "Day · crew lanes" : "Week view"} ·{" "}
            {members?.length ?? 0} people on account
          </p>
          <div className="mt-2 flex gap-3 text-sm">
            <a
              href={`/calendar?view=week&week=${weekParam}`}
              className={view === "week" ? "text-charcoal" : "text-copper"}
            >
              Week
            </a>
            <a
              href={`/calendar?view=day&day=${dayParam}`}
              className={view === "day" ? "text-charcoal" : "text-copper"}
            >
              Day
            </a>
          </div>
        </div>
        <a
          href={
            view === "day"
              ? `/calendar?view=day&day=${dayParam}&new=1`
              : `/calendar?week=${weekParam}&new=1`
          }
          className="text-sm text-copper"
        >
          Add appointment →
        </a>
      </header>

      {view === "day" ? (
        <DayCalendar
          dayIso={dayStart.toISOString()}
          prevHref={`/calendar?view=day&day=${prevDay}`}
          nextHref={`/calendar?view=day&day=${nextDay}`}
          weekHref={`/calendar?view=week&week=${weekParam}`}
          appointments={appointments ?? []}
          members={members ?? []}
        />
      ) : (
        <WeekCalendar
          weekStartIso={weekStart.toISOString()}
          prevHref={`/calendar?week=${prevWeek}`}
          nextHref={`/calendar?week=${nextWeek}`}
          appointments={appointments ?? []}
          members={members ?? []}
        />
      )}

      {params.new === "1" ? (
        <p className="text-xs text-charcoal/50">
          Tap an empty hour on the grid to prefill a new appointment.
        </p>
      ) : null}

      {client.site_key ? (
        <p className="text-xs text-charcoal/50">
          Public booking:{" "}
          <a className="text-copper" href={`/book/${client.site_key}`}>
            /book/{client.site_key}
          </a>
        </p>
      ) : null}
    </div>
  );
}

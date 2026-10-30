"use client";

import { useMemo, useState, useTransition } from "react";
import { addDays, format, startOfDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bookAppointment } from "./actions";

type Service = {
  id: string;
  name: string;
  duration_minutes: number;
  default_price: number | null;
};

export function BookingWizard({
  siteKey,
  businessName,
  services,
}: {
  siteKey: string;
  businessName: string;
  services: Service[];
}) {
  const [step, setStep] = useState<"service" | "day" | "slot" | "confirm">(
    "service",
  );
  const [serviceId, setServiceId] = useState("");
  const [day, setDay] = useState<string>("");
  const [slot, setSlot] = useState<string>("");
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const service = services.find((s) => s.id === serviceId);

  const dayOptions = useMemo(() => {
    const start = startOfDay(new Date());
    return Array.from({ length: 14 }, (_, i) => addDays(start, i));
  }, []);

  async function loadSlots(nextServiceId: string, nextDay: string) {
    setLoadingSlots(true);
    setError(null);
    setSlots([]);
    setSlot("");
    setStep("slot");
    try {
      const res = await fetch(
        `/api/public/slots?site_key=${encodeURIComponent(siteKey)}&service_id=${encodeURIComponent(nextServiceId)}&from=${encodeURIComponent(nextDay)}&to=${encodeURIComponent(nextDay)}`,
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Unable to load slots");
      setSlots(body.slots ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load slots");
    } finally {
      setLoadingSlots(false);
    }
  }

  function onBook(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await bookAppointment(siteKey, formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="mt-8 space-y-4">
      {step !== "service" ? (
        <button
          type="button"
          className="text-sm text-copper"
          onClick={() => {
            if (step === "day") setStep("service");
            else if (step === "slot") setStep("day");
            else if (step === "confirm") setStep("slot");
          }}
        >
          ← Back
        </button>
      ) : null}

      {step === "service" ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-charcoal">Choose a service</p>
          {services.map((s) => (
            <button
              key={s.id}
              type="button"
              className="flex w-full items-center justify-between rounded-lg border border-charcoal/15 bg-white px-4 py-3 text-left hover:border-copper"
              onClick={() => {
                setServiceId(s.id);
                setDay("");
                setSlot("");
                setSlots([]);
                setStep("day");
              }}
            >
              <span>
                <span className="block font-medium">{s.name}</span>
                <span className="text-xs text-charcoal/60">
                  {s.duration_minutes} min
                  {s.default_price != null ? ` · $${s.default_price}` : ""}
                </span>
              </span>
            </button>
          ))}
          {!services.length ? (
            <p className="text-sm text-charcoal/60">
              No online-bookable services yet.
            </p>
          ) : null}
        </div>
      ) : null}

      {step === "day" ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-charcoal">
            {service?.name} — pick a day
          </p>
          <div className="grid grid-cols-2 gap-2">
            {dayOptions.map((d) => {
              const value = format(d, "yyyy-MM-dd");
              return (
                <button
                  key={value}
                  type="button"
                  className="rounded-lg border border-charcoal/15 bg-white px-3 py-2 text-left text-sm hover:border-copper"
                  onClick={() => {
                    setDay(value);
                    void loadSlots(serviceId, value);
                  }}
                >
                  {format(d, "EEE MMM d")}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {step === "slot" || step === "confirm" ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-charcoal">
            {service?.name} ·{" "}
            {day ? format(new Date(`${day}T12:00:00`), "EEE MMM d") : ""}
          </p>
          {loadingSlots ? (
            <p className="text-sm text-charcoal/60">Loading times…</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((iso) => {
                const label = format(new Date(iso), "h:mm a");
                const selected = slot === iso;
                return (
                  <button
                    key={iso}
                    type="button"
                    className={`rounded-md border px-3 py-2 text-sm ${
                      selected
                        ? "border-copper bg-copper text-white"
                        : "border-charcoal/15 bg-white hover:border-copper"
                    }`}
                    onClick={() => {
                      setSlot(iso);
                      setStep("confirm");
                    }}
                  >
                    {label}
                  </button>
                );
              })}
              {!slots.length ? (
                <p className="text-sm text-charcoal/60">
                  No open times this day. Try another day.
                </p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {step === "confirm" && slot ? (
        <form
          action={onBook}
          className="space-y-3 rounded-xl border border-charcoal/10 bg-white p-4"
        >
          <p className="text-sm text-charcoal/70">
            Confirm with {businessName} at{" "}
            {format(new Date(slot), "EEE MMM d · h:mm a")}
          </p>
          <input type="hidden" name="service_id" value={serviceId} />
          <input type="hidden" name="start_at" value={slot} />
          <Input name="name" placeholder="Your name" required />
          <Input name="phone" placeholder="Phone" required />
          <Input name="email" type="email" placeholder="Email" />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Booking…" : "Confirm booking"}
          </Button>
        </form>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}

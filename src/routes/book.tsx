import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { addDays, format, isSameDay } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { ArrowLeft, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { eur, usePublicServices } from "@/lib/public-services";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/book")({
  validateSearch: (s: Record<string, unknown>): { service?: string } =>
    typeof s["service"] === "string" ? { service: s["service"] } : {},
  head: () => ({
    meta: [
      { title: "Book an appointment — Aleksova Beauty Studio" },
      {
        name: "description",
        content: "Choose a service, pick a free time and request your lash or makeup appointment.",
      },
      { property: "og:title", content: "Book an appointment — Aleksova Beauty Studio" },
      {
        property: "og:description",
        content: "Request a lash or makeup appointment online. No account needed.",
      },
    ],
  }),
  component: Book,
});

const STEPS = ["Service", "Date & time", "Your details", "Review"];
const TIMEZONE = "Europe/Sofia";

function Book() {
  const { services, loading: loadingServices, error: servicesError } = usePublicServices();
  const search = Route.useSearch();
  const [today] = useState(() => formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd"));
  const [step, setStep] = useState(search.service ? 1 : 0);
  const [serviceId, setServiceId] = useState<string | undefined>(search.service);
  const [day, setDay] = useState(today);
  const [weekOffset, setWeekOffset] = useState(0);
  const [time, setTime] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reference, setReference] = useState("");
  const [notification, setNotification] = useState<{
    mode: "local-preview" | "provider" | "unavailable";
    delivered: boolean;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const service = services.find((item) => item.id === serviceId);
  const days = useMemo(
    () =>
      Array.from({ length: 14 }, (_, index) => {
        const date = new Date(`${today}T12:00:00Z`);
        date.setUTCDate(date.getUTCDate() + index + weekOffset * 14);
        return date.toISOString().slice(0, 10);
      }),
    [today, weekOffset],
  );

  useEffect(() => {
    if (!serviceId || step !== 1) return;
    let current = true;
    setLoadingSlots(true);
    setSlots([]);
    void fetch(
      `/api/availability?date=${encodeURIComponent(day)}&service=${encodeURIComponent(serviceId)}`,
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Availability could not be loaded.");
        const data = (await response.json()) as { slots: string[] };
        if (current) setSlots(data.slots);
      })
      .catch(() => {
        if (current)
          setErrors((previous) => ({
            ...previous,
            availability: "Availability is temporarily unavailable.",
          }));
      })
      .finally(() => {
        if (current) setLoadingSlots(false);
      });
    return () => {
      current = false;
    };
  }, [day, serviceId, step]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 2) e["name"] = "Please enter your name.";
    if (!/^[+\d][\d\s()-]{6,}$/.test(form.phone.trim()))
      e["phone"] = "Please enter a valid phone number.";
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email))
      e["email"] = "Please check your email address.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!service || !time) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serviceId: service.id,
          date: day,
          time: formatInTimeZone(new Date(time), TIMEZONE, "HH:mm"),
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          notes: form.notes.trim(),
        }),
      });
      const result = (await response.json()) as {
        reference?: string;
        error?: string;
        notification?: { mode: "local-preview" | "provider" | "unavailable"; delivered: boolean };
      };
      if (!response.ok) {
        if (response.status === 409) {
          setTime(null);
          setStep(1);
        }
        throw new Error(result.error ?? "Your request could not be submitted.");
      }
      setReference(result.reference ?? "");
      setNotification(result.notification ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Your request could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  };

  if (reference && service && time)
    return (
      <Shell>
        <div className="mx-auto max-w-md py-10 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blush">
            <Check className="h-8 w-8 text-blush-foreground" />
          </div>
          <h1 className="mt-6 text-4xl">Request received</h1>
          <p className="mt-4 text-muted-foreground">
            {service.name} · {formatInTimeZone(new Date(time), TIMEZONE, "EEEE d MMMM, HH:mm")}.
            Your time is reserved while the studio reviews your request.
          </p>
          <p className="mt-4 font-semibold">Awaiting approval</p>
          <p className="mt-2 text-sm text-muted-foreground">Booking reference: {reference}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {notification?.delivered
              ? "The configured notification provider reported delivery."
              : notification?.mode === "unavailable"
                ? "No notification was sent. Your booking request is still saved."
                : "Local development preview only. No email or SMS was sent."}
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild variant="ghost" size="lg">
              <Link to="/">Back home</Link>
            </Button>
          </div>
        </div>
      </Shell>
    );

  return (
    <Shell>
      <ol className="mb-10 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={cn(
              "flex items-center gap-2",
              i === step ? "text-foreground" : "text-muted-foreground",
            )}
            aria-current={i === step ? "step" : undefined}
          >
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full border text-xs",
                i < step && "bg-primary text-primary-foreground",
                i === step && "border-primary",
              )}
            >
              {i < step ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section>
          <h1 className="text-4xl">Choose a service</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Development sample prices and durations; confirm before accepting bookings.
          </p>
          {loadingServices && (
            <p className="mt-4 text-sm text-muted-foreground">Loading services…</p>
          )}
          {servicesError && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {servicesError}
            </p>
          )}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {services.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setServiceId(s.id);
                  setTime(null);
                  setStep(1);
                }}
                className={cn(
                  "rounded-lg border bg-surface p-5 text-left transition hover:border-primary",
                  serviceId === s.id && "border-primary ring-1 ring-primary",
                )}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-serif text-2xl">{s.name}</span>
                  <span className="font-serif text-xl">{eur(s.price)}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {s.duration} min · {s.description}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 1 && service && (
        <section>
          <h1 className="text-4xl">Pick a date & time</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {service.name} · {service.duration} min
          </p>
          <div className="mt-6 flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Earlier dates"
              disabled={weekOffset === 0}
              onClick={() => setWeekOffset((w) => w - 1)}
            >
              <ChevronLeft />
            </Button>
            <div className="grid flex-1 grid-cols-4 gap-2 sm:grid-cols-7">
              {days.map((d) => {
                const date = new Date(`${d}T12:00:00Z`);
                return (
                  <button
                    key={d}
                    onClick={() => {
                      setDay(d);
                      setTime(null);
                    }}
                    className={cn(
                      "flex min-h-16 flex-col items-center justify-center rounded-lg border bg-surface text-sm disabled:opacity-40",
                      isSameDay(date, new Date(`${day}T12:00:00Z`)) &&
                        "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    <span className="text-xs uppercase">{format(date, "EEE")}</span>
                    <span className="font-serif text-xl">{format(date, "d")}</span>
                  </button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label="Later dates"
              disabled={weekOffset >= 3}
              onClick={() => setWeekOffset((w) => w + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
          <h2 className="mt-8 text-2xl">{format(new Date(`${day}T12:00:00Z`), "EEEE d MMMM")}</h2>
          {errors["availability"] && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {errors["availability"]}
            </p>
          )}
          {loadingSlots && (
            <p className="mt-3 text-sm text-muted-foreground">Checking available times…</p>
          )}
          {slots.length === 0 ? (
            !loadingSlots && (
              <p className="mt-3 rounded-lg border border-dashed p-6 text-center text-muted-foreground">
                No free times on this day. Please choose another date.
              </p>
            )
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {slots.map((s) => (
                <button
                  key={s}
                  onClick={() => setTime(s)}
                  className={cn(
                    "min-h-11 rounded-md border bg-surface text-sm hover:border-primary",
                    time === s && "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {formatInTimeZone(new Date(s), TIMEZONE, "HH:mm")}
                </button>
              ))}
            </div>
          )}
          <Nav back={() => setStep(0)} next={() => setStep(2)} disabled={!time} />
        </section>
      )}

      {step === 1 && !service && (
        <section>
          <h1 className="text-4xl">Pick a date & time</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {loadingServices
              ? "Loading services…"
              : servicesError || "Choose an available service to continue."}
          </p>
          <Button variant="ghost" size="lg" className="mt-5" onClick={() => setStep(0)}>
            <ArrowLeft />
            Choose service
          </Button>
        </section>
      )}

      {step === 2 && (
        <section className="max-w-lg">
          <h1 className="text-4xl">Your details</h1>
          <p className="mt-1 text-sm text-muted-foreground">No account needed.</p>
          <div className="mt-6 space-y-4">
            {(
              [
                ["name", "Name", "text", true],
                ["phone", "Phone", "tel", true],
                ["email", "Email (optional)", "email", false],
              ] as const
            ).map(([k, label, type, req]) => (
              <div key={k}>
                <Label htmlFor={k}>{label}</Label>
                <Input
                  id={k}
                  type={type}
                  required={req}
                  value={form[k]}
                  aria-invalid={!!errors[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  className="mt-1 h-11 bg-surface"
                />
                {errors[k] && <p className="mt-1 text-sm text-destructive">{errors[k]}</p>}
              </div>
            ))}
            <div>
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="mt-1 bg-surface"
                placeholder="Allergies, preferred look, first visit…"
              />
            </div>
          </div>
          <Nav back={() => setStep(1)} next={() => validate() && setStep(3)} />
        </section>
      )}

      {step === 3 && service && time && (
        <section className="max-w-lg">
          <h1 className="text-4xl">Review your request</h1>
          <dl className="mt-6 divide-y rounded-lg border bg-surface">
            {[
              ["Service", service.name],
              ["When", formatInTimeZone(new Date(time), TIMEZONE, "EEEE d MMMM, HH:mm")],
              ["Duration", `${service.duration} min`],
              ["Price (development sample)", eur(service.price)],
              ["Name", form.name],
              ["Phone", form.phone],
              ...(form.email ? [["Email", form.email]] : []),
              ...(form.notes ? [["Notes", form.notes]] : []),
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-4 py-3 text-sm">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            No payment is collected online. Local preview only; no notification will be sent.
          </p>
          <Nav
            back={() => setStep(2)}
            next={() => void submit()}
            disabled={submitting}
            nextLabel={submitting ? "Sending…" : "Send request"}
          />
        </section>
      )}
    </Shell>
  );
}

function Nav({
  back,
  next,
  disabled,
  nextLabel = "Continue",
}: {
  back: () => void;
  next: () => void;
  disabled?: boolean;
  nextLabel?: string;
}) {
  return (
    <div className="mt-8 flex flex-wrap justify-between gap-3">
      <Button variant="ghost" size="lg" onClick={back}>
        <ArrowLeft /> Back
      </Button>
      <Button variant="hero" size="lg" onClick={next} disabled={disabled}>
        {nextLabel}
      </Button>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pb-24">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Link to="/" className="font-serif text-2xl">
            Aleksova <span className="italic text-taupe">Beauty Studio</span>
          </Link>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-10">{children}</main>
    </div>
  );
}

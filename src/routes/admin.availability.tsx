import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AppointmentDrawer } from "@/components/admin/AppointmentDrawer";
import { Field } from "@/components/admin/AppointmentForm";
import { BlockTimeDialog } from "@/components/admin/BlockTimeDialog";
import { Confirm, Empty, PageTitle } from "@/components/admin/shared";
import {
  removeBlock,
  removeException,
  setBookingSettings,
  setException,
  setDefaultBuffer,
  setHours,
  useStudio,
} from "@/lib/studio/store-api";
import { fmtMin, isoDate, toMin } from "@/lib/studio/logic";
import { WEEKDAYS, type DayHours } from "@/lib/studio/types";

export const Route = createFileRoute("/admin/availability")({
  head: () => ({
    meta: [
      { title: "Availability — Admin demo" },
      { name: "description", content: "Working hours, breaks and blocked time." },
    ],
  }),
  component: Availability,
});

function Availability() {
  const st = useStudio();
  const [blocking, setBlocking] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [exceptionDate, setExceptionDate] = useState(isoDate(new Date()));
  const [exceptionClosed, setExceptionClosed] = useState(false);
  const [exceptionStart, setExceptionStart] = useState("09:00");
  const [exceptionEnd, setExceptionEnd] = useState("18:00");
  const [exceptionNote, setExceptionNote] = useState("");
  const upcoming = st.blocks
    .filter((b) => b.date >= isoDate(new Date()))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const exceptions = [...st.exceptions].sort((a, b) => a.date.localeCompare(b.date));

  const saveException = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await setException({
        date: exceptionDate,
        closed: exceptionClosed,
        ...(!exceptionClosed ? { start: toMin(exceptionStart), end: toMin(exceptionEnd) } : {}),
        note: exceptionNote.trim(),
      });
      toast.success("Date exception saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Exception could not be saved.");
    }
  };

  return (
    <>
      <PageTitle title="Availability">
        <Button onClick={() => setBlocking(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Block time
        </Button>
      </PageTitle>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="surface divide-y">
          {st.hours.map((h, i) => (
            <DayRow key={i} i={i} h={h} />
          ))}
        </section>
        <div className="space-y-6">
          <section className="surface p-4">
            <h2 className="mb-1 text-xl font-semibold">Default buffer</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Cleanup time after each appointment, unless a service sets its own.
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={120}
                step={5}
                className="w-24"
                defaultValue={st.defaultBuffer}
                onBlur={(e) => {
                  const n = Math.max(0, Math.min(120, Number(e.target.value) || 0));
                  void setDefaultBuffer(n)
                    .then(() => toast.success(`Default buffer set to ${n} min`))
                    .catch((error) => toast.error(error.message));
                }}
              />
              <span className="text-sm">minutes</span>
            </div>
          </section>
          <section className="surface p-4">
            <h2 className="mb-1 text-xl font-semibold">Booking limits</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Changes apply to new requests. Existing bookings remain in place.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Advance notice (hours)">
                <Input
                  type="number"
                  min={0}
                  max={720}
                  defaultValue={st.minNoticeHours}
                  onBlur={(event) => {
                    const value = Number(event.target.value);
                    void setBookingSettings({ minNoticeHours: value })
                      .then(() => toast.success("Advance notice saved"))
                      .catch((error) => toast.error(error.message));
                  }}
                />
              </Field>
              <Field label="Booking horizon (days)">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  defaultValue={st.bookingHorizonDays}
                  onBlur={(event) => {
                    const value = Number(event.target.value);
                    void setBookingSettings({ bookingHorizonDays: value })
                      .then(() => toast.success("Booking horizon saved"))
                      .catch((error) => toast.error(error.message));
                  }}
                />
              </Field>
              <Field label="Request expiry (min)">
                <Input
                  type="number"
                  min={5}
                  max={10080}
                  defaultValue={st.pendingExpiryMinutes}
                  onBlur={(event) => {
                    const value = Number(event.target.value);
                    void setBookingSettings({ pendingExpiryMinutes: value })
                      .then(() => toast.success("Request expiry saved"))
                      .catch((error) => toast.error(error.message));
                  }}
                />
              </Field>
            </div>
          </section>
          <section className="surface p-4">
            <h2 className="mb-1 text-xl font-semibold">Date exceptions</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Change hours or close a specific date. Conflicts are rejected.
            </p>
            <form onSubmit={(event) => void saveException(event)} className="space-y-3">
              <Input
                type="date"
                value={exceptionDate}
                onChange={(event) => setExceptionDate(event.target.value)}
                required
              />
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={exceptionClosed} onCheckedChange={setExceptionClosed} />
                Closed on this date
              </label>
              {!exceptionClosed && (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    aria-label="Exception opening time"
                    type="time"
                    value={exceptionStart}
                    onChange={(event) => setExceptionStart(event.target.value)}
                  />
                  <Input
                    aria-label="Exception closing time"
                    type="time"
                    value={exceptionEnd}
                    onChange={(event) => setExceptionEnd(event.target.value)}
                  />
                </div>
              )}
              <Input
                aria-label="Exception note"
                placeholder="Note (optional)"
                value={exceptionNote}
                onChange={(event) => setExceptionNote(event.target.value)}
                maxLength={250}
              />
              <Button type="submit" size="sm">
                Save exception
              </Button>
            </form>
            {exceptions.length > 0 && (
              <ul className="mt-3 divide-y">
                {exceptions.map((exception) => (
                  <li key={exception.date} className="flex items-center gap-2 py-2 text-sm">
                    <span className="flex-1">
                      {format(new Date(`${exception.date}T12:00:00`), "EEE d MMM yyyy")} ·{" "}
                      {exception.is_closed
                        ? "Closed"
                        : `${fmtMin(exception.start_minute ?? 0)}–${fmtMin(exception.end_minute ?? 0)}`}
                      {exception.note && (
                        <span className="block text-xs text-muted-foreground">
                          {exception.note}
                        </span>
                      )}
                    </span>
                    <Confirm
                      trigger={
                        <Button size="icon" variant="ghost" aria-label="Remove exception">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      }
                      title="Remove this date exception?"
                      description="Weekly hours will apply again for this date."
                      confirmLabel="Remove"
                      onConfirm={() => {
                        void removeException(exception.date)
                          .then(() => toast.success("Exception removed"))
                          .catch((error) => toast.error(error.message));
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="surface p-4">
            <h2 className="mb-3 text-xl font-semibold">Blocked time</h2>
            {upcoming.length === 0 ? (
              <Empty>No upcoming blocked periods.</Empty>
            ) : (
              <ul className="divide-y">
                {upcoming.map((b) => (
                  <li key={b.id} className="flex items-center gap-2 py-2 text-sm">
                    <span className="flex-1">
                      <span className="font-medium">
                        {format(new Date(b.date + "T00:00"), "EEE d MMM")}
                      </span>{" "}
                      · {b.allDay ? "All day" : `${fmtMin(b.start)}–${fmtMin(b.end)}`}
                      {b.reason && (
                        <span className="block text-xs text-muted-foreground">{b.reason}</span>
                      )}
                    </span>
                    <Confirm
                      trigger={
                        <Button size="icon" variant="ghost" aria-label="Remove block">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      }
                      title="Remove this block?"
                      description="Clients will be able to book this time again."
                      confirmLabel="Remove"
                      onConfirm={() => {
                        void removeBlock(b.id)
                          .then(() => toast.success("Block removed"))
                          .catch((error) => toast.error(error.message));
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
      <BlockTimeDialog
        open={blocking}
        onOpenChange={setBlocking}
        onOpenAppointment={(id) => {
          setBlocking(false);
          setOpenId(id);
        }}
      />
      <AppointmentDrawer id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function DayRow({ i, h }: { i: number; h: DayHours }) {
  const save = async (next: DayHours) => {
    if (next.end <= next.start) {
      toast.error("Closing time must be after opening time.");
      return;
    }
    if (next.breaks.some((b) => b.end <= b.start || b.start < next.start || b.end > next.end)) {
      toast.error("Breaks must sit inside working hours.");
      return;
    }
    try {
      await setHours(i, next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Working hours could not be saved.");
    }
  };
  return (
    <div className="flex flex-wrap items-start gap-3 p-4">
      <div className="flex w-36 items-center gap-2 pt-2">
        <Switch
          checked={h.open}
          onCheckedChange={(open) => void save({ ...h, open })}
          aria-label={`${WEEKDAYS[i]} open`}
        />
        <span className="font-medium">{WEEKDAYS[i]}</span>
      </div>
      {h.open ? (
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              type="time"
              step={900}
              className="w-28"
              value={fmtMin(h.start)}
              onChange={(e) => e.target.value && void save({ ...h, start: toMin(e.target.value) })}
            />
            <span>–</span>
            <Input
              type="time"
              step={900}
              className="w-28"
              value={fmtMin(h.end)}
              onChange={(e) => e.target.value && void save({ ...h, end: toMin(e.target.value) })}
            />
          </div>
          {h.breaks.map((b, j) => (
            <div key={j} className="flex items-center gap-2 text-sm">
              <span className="w-12 text-muted-foreground">Break</span>
              <Input
                type="time"
                step={900}
                className="w-28"
                value={fmtMin(b.start)}
                onChange={(e) =>
                  e.target.value &&
                  void save({
                    ...h,
                    breaks: h.breaks.map((x, k) =>
                      k === j ? { ...x, start: toMin(e.target.value) } : x,
                    ),
                  })
                }
              />
              <span>–</span>
              <Input
                type="time"
                step={900}
                className="w-28"
                value={fmtMin(b.end)}
                onChange={(e) =>
                  e.target.value &&
                  void save({
                    ...h,
                    breaks: h.breaks.map((x, k) =>
                      k === j ? { ...x, end: toMin(e.target.value) } : x,
                    ),
                  })
                }
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label="Remove break"
                onClick={() => void save({ ...h, breaks: h.breaks.filter((_, k) => k !== j) })}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const s = Math.min(Math.max(h.start, 13 * 60), h.end - 30);
              void save({
                ...h,
                breaks: [...h.breaks, { start: s, end: Math.min(s + 30, h.end) }],
              });
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add break
          </Button>
        </div>
      ) : (
        <span className="pt-2 text-sm text-muted-foreground">Closed</span>
      )}
    </div>
  );
}

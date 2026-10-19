import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { addDays, format, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppointmentDrawer } from "@/components/admin/AppointmentDrawer";
import { AppointmentForm } from "@/components/admin/AppointmentForm";
import { Empty, PageTitle, StatusBadge } from "@/components/admin/shared";
import { useStudio } from "@/lib/studio/store-api";
import { dayIndex, fmtMin, isoDate } from "@/lib/studio/logic";
import { STATUS_LABEL, type Status } from "@/lib/studio/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/appointments")({
  head: () => ({
    meta: [
      { title: "Appointments — Admin demo" },
      { name: "description", content: "Weekly calendar of studio appointments." },
    ],
  }),
  component: Appointments,
});

const DAY_START = 8 * 60,
  DAY_END = 20 * 60,
  PX = 1; // 1px per minute

function Appointments() {
  const st = useStudio();
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(`${isoDate(new Date())}T12:00:00`), { weekStartsOn: 1 }),
  );
  const [status, setStatusF] = useState<"all" | Status>("all");
  const [service, setService] = useState("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const days = Array.from({ length: 7 }, (_, i) => isoDate(addDays(weekStart, i)));
  const todayIso = isoDate(new Date());
  const list = st.appointments
    .filter(
      (a) =>
        days.includes(a.date) &&
        (status === "all" || a.status === status) &&
        (service === "all" || a.serviceId === service) &&
        (!search ||
          `${a.clientName} ${a.phone} ${a.serviceName}`
            .toLowerCase()
            .includes(search.toLowerCase())),
    )
    .sort((a, b) =>
      (a.date + String(a.start).padStart(4, "0")).localeCompare(
        b.date + String(b.start).padStart(4, "0"),
      ),
    );
  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => DAY_START + i * 60);

  return (
    <>
      <PageTitle title="Appointments">
        <Button onClick={() => setAdding(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Add appointment
        </Button>
      </PageTitle>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            aria-label="Previous week"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              setWeekStart(
                startOfWeek(new Date(`${isoDate(new Date())}T12:00:00`), { weekStartsOn: 1 }),
              )
            }
          >
            Today
          </Button>
          <Button
            size="icon"
            variant="outline"
            aria-label="Next week"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <span className="font-display text-xl font-semibold">
          {format(weekStart, "d MMM")} – {format(addDays(weekStart, 6), "d MMM yyyy")}
        </span>
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <Input
            aria-label="Search appointments"
            placeholder="Search client or service"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="min-w-0 sm:w-56"
          />
          <Select value={status} onValueChange={(v) => setStatusF(v as typeof status)}>
            <SelectTrigger className="sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={service} onValueChange={setService}>
            <SelectTrigger className="sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All services</SelectItem>
              {st.services.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Desktop: week grid */}
      <div className="surface hidden overflow-hidden md:block">
        <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b">
          <div />
          {days.map((d) => (
            <div
              key={d}
              className={cn(
                "border-l px-2 py-2 text-center text-sm",
                d === todayIso && "bg-accent",
              )}
            >
              <div className="text-xs uppercase text-muted-foreground">
                {format(new Date(d + "T00:00"), "EEE")}
              </div>
              <div className="font-display text-xl font-semibold">
                {format(new Date(d + "T00:00"), "d")}
              </div>
            </div>
          ))}
        </div>
        <div
          className="grid grid-cols-[56px_repeat(7,1fr)]"
          style={{ height: (DAY_END - DAY_START) * PX }}
        >
          <div className="relative">
            {hours.map((h) => (
              <div
                key={h}
                className="absolute right-2 text-xs text-muted-foreground"
                style={{ top: (h - DAY_START) * PX - 6 }}
              >
                {fmtMin(h)}
              </div>
            ))}
          </div>
          {days.map((d) => {
            const h = st.hours[dayIndex(d)]!;
            return (
              <div key={d} className={cn("relative border-l", !h.open && "bg-muted")}>
                {hours.map((x) => (
                  <div
                    key={x}
                    className="absolute inset-x-0 border-t border-border/60"
                    style={{ top: (x - DAY_START) * PX }}
                  />
                ))}
                {h.open &&
                  h.breaks.map((b, i) => (
                    <div
                      key={i}
                      className="absolute inset-x-0 bg-muted/80"
                      style={{ top: (b.start - DAY_START) * PX, height: (b.end - b.start) * PX }}
                    />
                  ))}
                {st.blocks
                  .filter((b) => b.date === d)
                  .map((b) => {
                    const s = b.allDay ? DAY_START : Math.max(b.start, DAY_START),
                      e = b.allDay ? DAY_END : Math.min(b.end, DAY_END);
                    return (
                      <div
                        key={b.id}
                        className="absolute inset-x-0 border-y border-dashed border-muted-foreground/40 bg-muted px-1 text-[10px] text-muted-foreground"
                        style={{ top: (s - DAY_START) * PX, height: Math.max(0, e - s) * PX }}
                      >
                        Blocked{b.reason && ` · ${b.reason}`}
                      </div>
                    );
                  })}
                {list
                  .filter((a) => a.date === d)
                  .map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setOpenId(a.id)}
                      className={cn(
                        `status-${a.status} absolute inset-x-1 overflow-hidden rounded-md px-1.5 py-1 text-left text-xs shadow-sm ring-1 ring-background transition hover:brightness-95`,
                      )}
                      style={{
                        top: (a.start - DAY_START) * PX,
                        height: Math.max(24, a.duration * PX),
                      }}
                    >
                      <div className="font-semibold">
                        {fmtMin(a.start)} {a.clientName}
                      </div>
                      <div className="truncate opacity-80">{a.serviceName}</div>
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile: agenda */}
      <div className="space-y-4 md:hidden">
        {days.map((d) => {
          const items = list.filter((a) => a.date === d);
          return (
            <section key={d}>
              <h2 className={cn("mb-2 text-lg font-semibold", d === todayIso && "text-primary")}>
                {format(new Date(d + "T00:00"), "EEEE d MMM")}
                {d === todayIso && " · Today"}
              </h2>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {st.hours[dayIndex(d)]!.open ? "No appointments" : "Closed"}
                </p>
              ) : (
                <ul className="space-y-2">
                  {items.map((a) => (
                    <li key={a.id}>
                      <button
                        onClick={() => setOpenId(a.id)}
                        className="surface flex w-full items-center gap-3 p-3 text-left"
                      >
                        <span className="w-14 font-semibold tabular-nums">{fmtMin(a.start)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{a.clientName}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {a.serviceName}
                          </span>
                        </span>
                        <StatusBadge status={a.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        {list.length === 0 && <Empty>No appointments match these filters this week.</Empty>}
      </div>
      <AppointmentDrawer id={openId} onClose={() => setOpenId(null)} />
      <AppointmentForm open={adding} onOpenChange={setAdding} />
    </>
  );
}

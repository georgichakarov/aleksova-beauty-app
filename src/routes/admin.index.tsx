import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { toast } from "sonner";
import { Ban, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppointmentDrawer } from "@/components/admin/AppointmentDrawer";
import { AppointmentForm } from "@/components/admin/AppointmentForm";
import { BlockTimeDialog } from "@/components/admin/BlockTimeDialog";
import { Confirm, Empty, PageTitle, Stat, StatusBadge } from "@/components/admin/shared";
import { setStatus, useStudio } from "@/lib/studio/store-api";
import { fmtMin, incomeSummary, money, nowParts } from "@/lib/studio/logic";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Overview — Admin demo" },
      { name: "description", content: "Today's appointments, requests and income." },
    ],
  }),
  component: Overview,
});

function Overview() {
  const st = useStudio();
  const now = nowParts();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const today = st.appointments
    .filter((a) => a.date === now.date && a.status !== "cancelled" && a.status !== "declined")
    .sort((a, b) => a.start - b.start);
  const pending = st.appointments
    .filter((a) => a.status === "pending")
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const inc = incomeSummary(st, now.date.slice(0, 7), now);

  return (
    <>
      <PageTitle title={`Good day, ${formatInTimeZone(new Date(), "Europe/Sofia", "EEEE d MMMM")}`}>
        <Button onClick={() => setAdding(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Add appointment
        </Button>
        <Button variant="outline" onClick={() => setBlocking(true)}>
          <Ban className="mr-1 h-4 w-4" />
          Block time
        </Button>
      </PageTitle>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat
          label="Received this month"
          value={money(inc.received)}
          hint="Payments recorded this month"
        />
        <Stat
          label="Expected income"
          value={money(inc.expected)}
          hint="Upcoming confirmed bookings, not yet paid"
        />
        <Stat label="Pending requests" value={String(pending.length)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface p-4">
          <h2 className="mb-3 text-2xl font-semibold">Today</h2>
          {today.length === 0 ? (
            <Empty>No appointments today.</Empty>
          ) : (
            <ul className="divide-y">
              {today.map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => setOpenId(a.id)}
                    className="flex w-full items-center gap-3 py-3 text-left"
                  >
                    <span className="w-24 shrink-0 font-semibold tabular-nums">
                      {fmtMin(a.start)}–{fmtMin(a.start + a.duration)}
                    </span>
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
        <section className="surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Booking requests</h2>
            <Link to="/admin/appointments" className="text-sm text-primary">
              Calendar →
            </Link>
          </div>
          {pending.length === 0 ? (
            <Empty>No requests waiting. You're all caught up.</Empty>
          ) : (
            <ul className="divide-y">
              {pending.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                  <button onClick={() => setOpenId(a.id)} className="min-w-0 flex-1 text-left">
                    <span className="block font-medium">{a.clientName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {a.serviceName} · {format(new Date(a.date + "T00:00"), "EEE d MMM")} ·{" "}
                      {fmtMin(a.start)}
                    </span>
                  </button>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        void setStatus(a.id, "confirmed")
                          .then(() => toast.success("Booking approved"))
                          .catch((error) => toast.error(error.message));
                      }}
                    >
                      Approve
                    </Button>
                    <Confirm
                      trigger={
                        <Button size="sm" variant="outline">
                          Decline
                        </Button>
                      }
                      title="Decline this request?"
                      description={`${a.clientName}'s slot will be released.`}
                      confirmLabel="Decline"
                      onConfirm={() =>
                        setStatus(a.id, "declined")
                          .then(() => toast("Request declined"))
                          .catch((error) => toast.error(error.message))
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <AppointmentDrawer id={openId} onClose={() => setOpenId(null)} />
      <AppointmentForm open={adding} onOpenChange={setAdding} />
      <BlockTimeDialog
        open={blocking}
        onOpenChange={setBlocking}
        onOpenAppointment={(id) => {
          setBlocking(false);
          setOpenId(id);
        }}
      />
    </>
  );
}

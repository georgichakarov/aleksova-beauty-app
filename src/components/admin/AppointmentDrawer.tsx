import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { addPayment, reschedule, setStatus, useStudio } from "@/lib/studio/store-api";
import {
  balanceOf,
  fmtMin,
  isoDate,
  money,
  paidFor,
  paymentStatus,
  toMin,
  type Conflict,
} from "@/lib/studio/logic";
import { METHOD_LABEL, SOURCE_LABEL, type PaymentMethod } from "@/lib/studio/types";
import { Confirm, ConflictList, PayBadge, StatusBadge } from "./shared";
import { Field } from "./AppointmentForm";

export function AppointmentDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const st = useStudio();
  const a = st.appointments.find((x) => x.id === id);
  const [mode, setMode] = useState<"none" | "reschedule" | "pay" | "refund">("none");
  useEffect(() => setMode("none"), [id]);

  const changeStatus = async (
    appointmentId: string,
    status: "confirmed" | "declined" | "cancelled" | "completed" | "no_show",
  ) => {
    try {
      await setStatus(appointmentId, status);
      toast.success(
        status === "confirmed" ? "Booking approved" : `Appointment ${status.replace("_", " ")}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Status could not be changed.");
    }
  };

  return (
    <Sheet open={!!a} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {a && (
          <>
            <SheetHeader className="text-left">
              <div className="flex items-center gap-2">
                <StatusBadge status={a.status} />
                <PayBadge status={paymentStatus(st, a)} />
              </div>
              <SheetTitle className="font-display text-3xl">{a.clientName}</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-4 text-sm">
              <div className="space-y-1.5">
                {a.phone && (
                  <a href={`tel:${a.phone}`} className="flex items-center gap-2 hover:text-primary">
                    <Phone className="h-4 w-4" />
                    {a.phone}
                  </a>
                )}
                {a.email && (
                  <a
                    href={`mailto:${a.email}`}
                    className="flex items-center gap-2 hover:text-primary"
                  >
                    <Mail className="h-4 w-4" />
                    {a.email}
                  </a>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-muted p-3">
                <dt className="text-muted-foreground">Service</dt>
                <dd className="font-medium">{a.serviceName}</dd>
                <dt className="text-muted-foreground">Date</dt>
                <dd className="font-medium">
                  {format(new Date(a.date + "T00:00"), "EEE d MMM yyyy")}
                </dd>
                <dt className="text-muted-foreground">Time</dt>
                <dd className="font-medium">
                  {fmtMin(a.start)}–{fmtMin(a.start + a.duration)}
                </dd>
                <dt className="text-muted-foreground">Booked price</dt>
                <dd className="font-medium">{money(a.price)}</dd>
                <dt className="text-muted-foreground">Paid</dt>
                <dd className="font-medium">{money(paidFor(st, a.id))}</dd>
                <dt className="text-muted-foreground">Balance</dt>
                <dd className="font-medium">{money(balanceOf(st, a))}</dd>
                <dt className="text-muted-foreground">Booked via</dt>
                <dd className="font-medium">{SOURCE_LABEL[a.source]}</dd>
              </dl>
              {a.notes && (
                <p className="rounded-lg border p-3">
                  <span className="text-muted-foreground">Notes: </span>
                  {a.notes}
                </p>
              )}

              <Separator />
              <div className="flex flex-wrap gap-2">
                {a.status === "pending" && (
                  <>
                    <Button onClick={() => void changeStatus(a.id, "confirmed")}>Approve</Button>
                    <Confirm
                      trigger={<Button variant="outline">Decline</Button>}
                      title="Decline this request?"
                      description="The slot will be released for other clients."
                      confirmLabel="Decline"
                      onConfirm={() => changeStatus(a.id, "declined")}
                    />
                  </>
                )}
                {a.status === "confirmed" && (
                  <>
                    <Button onClick={() => void changeStatus(a.id, "completed")}>
                      Mark completed
                    </Button>
                    <Button variant="outline" onClick={() => void changeStatus(a.id, "no_show")}>
                      No-show
                    </Button>
                  </>
                )}
                {(a.status === "pending" || a.status === "confirmed") && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setMode(mode === "reschedule" ? "none" : "reschedule")}
                    >
                      Reschedule
                    </Button>
                    <Confirm
                      trigger={
                        <Button variant="ghost" className="text-destructive">
                          Cancel appointment
                        </Button>
                      }
                      title="Cancel this appointment?"
                      description="The time will become available to clients again."
                      confirmLabel="Cancel appointment"
                      onConfirm={() => changeStatus(a.id, "cancelled")}
                    />
                  </>
                )}
                {a.status !== "cancelled" && a.status !== "declined" && balanceOf(st, a) > 0 && (
                  <Button
                    variant="secondary"
                    onClick={() => setMode(mode === "pay" ? "none" : "pay")}
                  >
                    Record payment
                  </Button>
                )}
                {paidFor(st, a.id) > 0 && a.status !== "cancelled" && a.status !== "declined" && (
                  <Button
                    variant="outline"
                    onClick={() => setMode(mode === "refund" ? "none" : "refund")}
                  >
                    Record refund
                  </Button>
                )}
              </div>
              {mode === "reschedule" && (
                <RescheduleForm
                  id={a.id}
                  date={a.date}
                  start={a.start}
                  done={() => setMode("none")}
                />
              )}
              {mode === "pay" && (
                <PaymentForm
                  appointmentId={a.id}
                  limit={balanceOf(st, a)}
                  kind="payment"
                  done={() => setMode("none")}
                />
              )}
              {mode === "refund" && (
                <PaymentForm
                  appointmentId={a.id}
                  limit={paidFor(st, a.id)}
                  kind="refund"
                  done={() => setMode("none")}
                />
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function RescheduleForm({
  id,
  date,
  start,
  done,
}: {
  id: string;
  date: string;
  start: number;
  done: () => void;
}) {
  const [d, setD] = useState(date);
  const [t, setT] = useState(fmtMin(start));
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  return (
    <form
      className="space-y-3 rounded-lg border p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const c = await reschedule(id, d, toMin(t));
        setConflicts(c);
        if (!c.length) {
          toast.success("Rescheduled");
          done();
        }
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="New date">
          <Input
            type="date"
            value={d}
            onChange={(e) => {
              setD(e.target.value);
              setConflicts([]);
            }}
          />
        </Field>
        <Field label="New time">
          <Input
            type="time"
            step={900}
            value={t}
            onChange={(e) => {
              setT(e.target.value);
              setConflicts([]);
            }}
          />
        </Field>
      </div>
      <ConflictList items={conflicts} />
      <Button type="submit" size="sm">
        Check & move
      </Button>
    </form>
  );
}

export function PaymentForm({
  appointmentId,
  limit,
  kind,
  done,
}: {
  appointmentId: string;
  limit: number;
  kind: "payment" | "refund";
  done: () => void;
}) {
  const [amount, setAmount] = useState(String(limit));
  const [date, setDate] = useState(isoDate(new Date()));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const busy = useRef(false);
  const idempotencyKey = useRef(crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      className="space-y-3 rounded-lg border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy.current) return;
        const n = Math.round(Number(amount) * 100) / 100;
        if (!Number.isFinite(n) || n <= 0) return setError("Enter an amount above zero.");
        if (n > limit + 0.001)
          return setError(
            `That's more than the available ${kind === "refund" ? "paid amount" : "balance"} (${money(limit)}).`,
          );
        if (!date) return setError("Choose the payment date.");
        busy.current = true;
        setSubmitting(true);
        void addPayment(
          { appointmentId, amount: n, date, method, note, kind },
          idempotencyKey.current,
        )
          .then(() => {
            toast.success(`${kind === "refund" ? "Refund" : "Payment"} of ${money(n)} recorded`);
            done();
          })
          .catch((error) => {
            setError(
              error instanceof Error ? error.message : "The transaction could not be saved.",
            );
            busy.current = false;
            setSubmitting(false);
          });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount received (€)">
          <Input
            inputMode="decimal"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError("");
            }}
          />
        </Field>
        <Field label="Payment date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Method">
        <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(METHOD_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Note (optional)">
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </Field>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="sm" disabled={submitting}>
        {submitting ? "Saving…" : kind === "refund" ? "Save refund" : "Save payment"}
      </Button>
    </form>
  );
}

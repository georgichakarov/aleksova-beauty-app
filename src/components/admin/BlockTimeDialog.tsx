import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { addBlock } from "@/lib/studio/store-api";
import { fmtMin, isoDate, toMin } from "@/lib/studio/logic";
import type { Appointment } from "@/lib/studio/types";
import { Field } from "./AppointmentForm";

export function BlockTimeDialog({
  open,
  onOpenChange,
  onOpenAppointment,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onOpenAppointment?: (id: string) => void;
}) {
  const [date, setDate] = useState(isoDate(new Date()));
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState("13:00");
  const [end, setEnd] = useState("15:00");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<Appointment[]>([]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!date) return setError("Choose a date.");
    if (!allDay && toMin(end) <= toMin(start))
      return setError("End time must be after start time.");
    const r = await addBlock({
      date,
      allDay,
      start: allDay ? 0 : toMin(start),
      end: allDay ? 1440 : toMin(end),
      reason: reason.trim(),
    });
    if (!r.ok) {
      setError(r.message);
      setConflicts(r.conflicts as Appointment[]);
      return;
    }
    toast.success("Time blocked", { description: "Clients can no longer book it." });
    setConflicts([]);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setConflicts([]);
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Block time</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Date">
            <Input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setConflicts([]);
              }}
            />
          </Field>
          <div className="flex items-center gap-2">
            <Switch
              id="allday"
              checked={allDay}
              onCheckedChange={(v) => {
                setAllDay(v);
                setConflicts([]);
              }}
            />
            <Label htmlFor="allday">Entire day</Label>
          </div>
          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="From">
                <Input
                  type="time"
                  step={900}
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    setConflicts([]);
                  }}
                />
              </Field>
              <Field label="To">
                <Input
                  type="time"
                  step={900}
                  value={end}
                  onChange={(e) => {
                    setEnd(e.target.value);
                    setConflicts([]);
                  }}
                />
              </Field>
            </div>
          )}
          <Field label="Reason (optional)">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Training, holiday"
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {conflicts.length > 0 && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
            >
              <p className="font-semibold text-destructive">
                This overlaps {conflicts.length} active appointment{conflicts.length > 1 ? "s" : ""}
                .
              </p>
              <p className="mb-2 text-muted-foreground">
                Reschedule, cancel or decline them first, then block the time.
              </p>
              <ul className="space-y-1">
                {conflicts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <span>
                      {fmtMin(a.start)} · {a.clientName} · {a.serviceName}
                    </span>
                    {onOpenAppointment && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenAppointment(a.id)}
                      >
                        Open
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" className="w-full sm:w-auto">
              Block time
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

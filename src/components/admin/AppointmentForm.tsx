import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createAppointment, useStudio } from "@/lib/studio/store-api";
import { isoDate, money, toMin, type Conflict } from "@/lib/studio/logic";
import type { Source, Status } from "@/lib/studio/types";
import { ConflictList } from "./shared";

export function AppointmentForm({
  open,
  onOpenChange,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultDate?: string;
}) {
  const st = useStudio();
  const services = st.services.filter((s) => !s.archived);
  const [f, setF] = useState({
    clientName: "",
    phone: "",
    email: "",
    serviceId: services[0]?.id ?? "",
    date: defaultDate ?? isoDate(new Date()),
    time: "10:00",
    notes: "",
    source: "instagram" as Source,
    status: "confirmed" as Status,
  });
  const [errors, setErrors] = useState<{ [k: string]: string | undefined }>({});
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const set = (k: keyof typeof f, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    setConflicts([]);
  };

  useEffect(() => {
    if (!f.serviceId && services[0])
      setF((previous) => ({ ...previous, serviceId: services[0]!.id }));
  }, [f.serviceId, services]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: { [k: string]: string | undefined } = {};
    if (f.clientName.trim().length < 2) err["clientName"] = "Enter the client's name.";
    if (!/^[+\d][\d\s()-]{5,24}$/.test(f.phone.trim()))
      err["phone"] = "Enter a valid phone number.";
    if (!f.serviceId) err["serviceId"] = "Choose a service.";
    if (!f.date) err["date"] = "Choose a date.";
    if (!/^\d{2}:\d{2}$/.test(f.time)) err["time"] = "Choose a time.";
    setErrors(err);
    if (Object.keys(err).length) return;
    setSubmitting(true);
    const r = await createAppointment({
      clientName: f.clientName.trim(),
      phone: f.phone.trim(),
      email: f.email.trim(),
      serviceId: f.serviceId,
      date: f.date,
      start: toMin(f.time),
      notes: f.notes.trim(),
      source: f.source,
      status: f.status,
    });
    setSubmitting(false);
    if (!r.ok) return setConflicts(r.conflicts);
    toast.success("Appointment added", { description: "This time is now reserved." });
    onOpenChange(false);
    setF((p) => ({ ...p, clientName: "", phone: "", email: "", notes: "" }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Add appointment</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Client name" error={errors["clientName"]}>
            <Input value={f.clientName} onChange={(e) => set("clientName", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" error={errors["phone"]}>
              <Input
                type="tel"
                required
                value={f.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </Field>
            <Field label="Email">
              <Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
          </div>
          <Field label="Service" error={errors["serviceId"]}>
            <Select value={f.serviceId} onValueChange={(v) => set("serviceId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} · {s.duration} min · {money(s.price)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" error={errors["date"]}>
              <Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} />
            </Field>
            <Field label="Start time" error={errors["time"]}>
              <Input
                type="time"
                step={900}
                value={f.time}
                onChange={(e) => set("time", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Booked via">
              <Select value={f.source} onValueChange={(v) => set("source", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={f.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Notes">
            <Textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
          <ConflictList items={conflicts} />
          <DialogFooter>
            <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
              {submitting ? "Saving…" : "Save appointment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

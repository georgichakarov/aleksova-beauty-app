import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/admin/AppointmentForm";
import { Confirm, PageTitle } from "@/components/admin/shared";
import { saveService, useStudio } from "@/lib/studio/store-api";
import { money } from "@/lib/studio/logic";
import type { Service } from "@/lib/studio/types";

export const Route = createFileRoute("/admin/services")({
  head: () => ({
    meta: [
      { title: "Services — Admin demo" },
      { name: "description", content: "Edit studio services, prices and durations." },
    ],
  }),
  component: Services,
});

const blank: Omit<Service, "id"> = {
  name: "",
  description: "",
  price: 0,
  duration: 60,
  buffer: null,
  bookable: true,
  archived: false,
};

function Services() {
  const st = useStudio();
  const [editing, setEditing] = useState<(Omit<Service, "id"> & { id?: string }) | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const list = st.services.filter((s) => showArchived || !s.archived);

  return (
    <>
      <PageTitle title="Services">
        <Button variant="ghost" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? "Hide archived" : "Show archived"}
        </Button>
        <Button onClick={() => setEditing({ ...blank })}>
          <Plus className="mr-1 h-4 w-4" />
          New service
        </Button>
      </PageTitle>
      <p className="mb-4 text-sm text-muted-foreground">
        Changes appear in the booking page immediately. Existing appointments keep the price and
        duration they were booked with.
      </p>
      <p className="mb-4 text-xs text-muted-foreground">
        Seeded names, prices and durations are development samples. Confirm them with the owner
        before enabling public booking.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((s) => (
          <div key={s.id} className="surface flex flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold">{s.name}</h2>
                <p className="text-sm text-muted-foreground">{s.description}</p>
              </div>
              <span className="font-display text-2xl font-semibold">{money(s.price)}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {s.duration} min · buffer {s.buffer ?? `${st.defaultBuffer} (default)`} min
            </div>
            <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
              {s.archived ? (
                <span className="text-sm font-medium text-muted-foreground">Archived</span>
              ) : (
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={s.bookable}
                    onCheckedChange={(v) => {
                      void saveService({ ...s, bookable: v })
                        .then(() =>
                          toast.success(v ? "Open for new bookings" : "Hidden from new bookings"),
                        )
                        .catch((error) => toast.error(error.message));
                    }}
                  />
                  Available for booking
                </label>
              )}
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing({ ...s })}>
                  Edit
                </Button>
                {s.archived ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void saveService({ ...s, archived: false })
                        .then(() => toast.success("Service restored"))
                        .catch((error) => toast.error(error.message));
                    }}
                  >
                    Restore
                  </Button>
                ) : (
                  <Confirm
                    trigger={
                      <Button size="sm" variant="ghost">
                        Archive
                      </Button>
                    }
                    title="Archive this service?"
                    description="It will no longer be offered. Past appointments keep their records."
                    confirmLabel="Archive"
                    onConfirm={() =>
                      saveService({ ...s, archived: true, bookable: false })
                        .then(() => toast("Service archived"))
                        .catch((error) => toast.error(error.message))
                    }
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      {editing && <ServiceDialog value={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ServiceDialog({
  value,
  onClose,
}: {
  value: Omit<Service, "id"> & { id?: string };
  onClose: () => void;
}) {
  const [v, setV] = useState({
    ...value,
    price: String(value.price),
    duration: String(value.duration),
    buffer: value.buffer == null ? "" : String(value.buffer),
  });
  const [err, setErr] = useState<{ [k: string]: string | undefined }>({});
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const er: { [k: string]: string | undefined } = {};
    const price = Number(v.price),
      duration = Number(v.duration),
      buffer = v.buffer === "" ? null : Number(v.buffer);
    if (v.name.trim().length < 2) er["name"] = "Enter a name.";
    if (!(price >= 0)) er["price"] = "Enter a valid price.";
    if (!(duration >= 5 && duration <= 600)) er["duration"] = "Between 5 and 600 minutes.";
    if (buffer !== null && !(buffer >= 0 && buffer <= 120))
      er["buffer"] = "Between 0 and 120 minutes.";
    setErr(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    try {
      await saveService({
        ...v,
        name: v.name.trim(),
        description: v.description.trim(),
        price,
        duration,
        buffer,
      });
      toast.success("Service saved");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Service could not be saved.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {value.id ? "Edit service" : "New service"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Name" error={err["name"]}>
            <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label="Description">
            <Textarea
              rows={2}
              value={v.description}
              onChange={(e) => setV({ ...v, description: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Price (€)" error={err["price"]}>
              <Input
                type="number"
                step="0.5"
                min="0"
                value={v.price}
                onChange={(e) => setV({ ...v, price: e.target.value })}
              />
            </Field>
            <Field label="Minutes" error={err["duration"]}>
              <Input
                type="number"
                step="5"
                value={v.duration}
                onChange={(e) => setV({ ...v, duration: e.target.value })}
              />
            </Field>
            <Field label="Buffer" error={err["buffer"]}>
              <Input
                type="number"
                step="5"
                placeholder="Default"
                value={v.buffer}
                onChange={(e) => setV({ ...v, buffer: e.target.value })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={v.bookable} onCheckedChange={(b) => setV({ ...v, bookable: b })} />
            Available for new bookings
          </label>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

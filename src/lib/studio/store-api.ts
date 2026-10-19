import { useEffect, useState, useSyncExternalStore } from "react";
import type { Appointment, Block, DayHours, Payment, Service, Status, StudioState } from "./types";

const EMPTY_STATE: StudioState = {
  services: [],
  appointments: [],
  payments: [],
  hours: Array.from({ length: 7 }, () => ({ open: false, start: 540, end: 1020, breaks: [] })),
  defaultBuffer: 10,
  minNoticeHours: 12,
  bookingHorizonDays: 90,
  pendingExpiryMinutes: 60,
  blocks: [],
  exceptions: [],
};

let state = EMPTY_STATE;
let refreshPromise: Promise<void> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

class AdminActionError extends Error {
  constructor(
    message: string,
    readonly payload: { conflicts?: unknown[] },
  ) {
    super(message);
  }
}

export function getState() {
  return state;
}

export function refreshStudio() {
  refreshPromise ??= fetch("/api/admin")
    .then(async (response) => {
      if (!response.ok) throw new Error("Could not load studio data.");
      state = (await response.json()) as StudioState;
      emit();
    })
    .finally(() => {
      refreshPromise = undefined;
    });
  return refreshPromise;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStudio(): StudioState {
  const value = useSyncExternalStore(subscribe, getState, () => EMPTY_STATE);
  useEffect(() => {
    void refreshStudio().catch(() => undefined);
  }, []);
  return value;
}

export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

async function adminAction<T = { ok: true }>(action: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/admin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(action),
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new AdminActionError(
      result.error ?? "The change could not be saved.",
      result as { conflicts?: unknown[] },
    );
  await refreshStudio();
  return result;
}

export interface NewAppointment {
  clientName: string;
  phone: string;
  email?: string;
  serviceId: string;
  date: string;
  start: number;
  notes?: string;
  source: Appointment["source"];
  status: Status;
}

export async function createAppointment(input: NewAppointment) {
  try {
    const result = await adminAction<{ ok: true; id: string }>({
      action: "create",
      name: input.clientName,
      phone: input.phone,
      email: input.email,
      serviceId: input.serviceId,
      date: input.date,
      time: `${String(Math.floor(input.start / 60)).padStart(2, "0")}:${String(input.start % 60).padStart(2, "0")}`,
      notes: input.notes,
      source: input.source === "website" ? "other" : input.source,
      status: input.status === "pending" ? "pending" : "confirmed",
    });
    return { ok: true as const, id: result.id };
  } catch (error) {
    return {
      ok: false as const,
      conflicts: [
        {
          kind: "appointment" as const,
          message: error instanceof Error ? error.message : "Time unavailable.",
        },
      ],
    };
  }
}

export function setStatus(id: string, status: Status) {
  if (status === "expired")
    return Promise.reject(new Error("Expired requests cannot be manually restored."));
  return adminAction({ action: "status", id, status });
}

export async function reschedule(id: string, date: string, start: number) {
  try {
    await adminAction({
      action: "reschedule",
      id,
      date,
      time: `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`,
    });
    return [];
  } catch (error) {
    return [
      {
        kind: "appointment" as const,
        message: error instanceof Error ? error.message : "Time unavailable.",
      },
    ];
  }
}

export function addPayment(
  payment: Omit<Payment, "id" | "createdAt">,
  idempotencyKey = crypto.randomUUID(),
) {
  return adminAction({
    action: "payment",
    idempotencyKey,
    appointmentId: payment.appointmentId,
    kind: "payment",
    amountMinor: Math.round(payment.amount * 100),
    date: payment.date,
    method: payment.method,
    note: payment.note ?? "",
  });
}

export function updatePayment(id: string, patch: Partial<Payment>) {
  const payment = state.payments.find((item) => item.id === id);
  if (!payment) return Promise.reject(new Error("Payment not found."));
  return adminAction({
    action: "correctPayment",
    id,
    idempotencyKey: crypto.randomUUID(),
    amountMinor: Math.round((patch.amount ?? Math.abs(payment.amount)) * 100),
    date: patch.date ?? payment.date,
    method: patch.method ?? payment.method,
  });
}

export function deletePayment(id: string) {
  const payment = state.payments.find((item) => item.id === id);
  if (!payment) return Promise.reject(new Error("Payment not found."));
  return adminAction({
    action: "payment",
    idempotencyKey: crypto.randomUUID(),
    appointmentId: payment.appointmentId,
    kind: payment.amount < 0 ? "payment" : "refund",
    amountMinor: Math.round(Math.abs(payment.amount) * 100),
    date: new Date().toISOString().slice(0, 10),
    method: payment.method,
    note: "Reversal of incorrect entry",
  });
}

export function saveService(service: Omit<Service, "id"> & { id?: string }) {
  return adminAction({
    action: "service",
    id: service.id,
    name: service.name,
    description: service.description,
    priceMinor: Math.round(service.price * 100),
    duration: service.duration,
    buffer: service.buffer,
    bookable: service.bookable,
    archived: service.archived,
  });
}

export function setHours(weekday: number, hours: DayHours) {
  return adminAction({ action: "hours", weekday, ...hours });
}

export function setDefaultBuffer(minutes: number) {
  return setBookingSettings({ defaultBuffer: minutes });
}

export function setBookingSettings(settings: {
  defaultBuffer?: number;
  minNoticeHours?: number;
  bookingHorizonDays?: number;
  pendingExpiryMinutes?: number;
}) {
  return adminAction({
    action: "settings",
    defaultBuffer: settings.defaultBuffer ?? state.defaultBuffer,
    ...settings,
  });
}

export function addBlock(block: Omit<Block, "id">) {
  return adminAction({ action: "block", ...block }).then(
    () => ({ ok: true as const }),
    (error: unknown) => ({
      ok: false as const,
      message: error instanceof Error ? error.message : "Time could not be blocked.",
      conflicts: error instanceof AdminActionError ? (error.payload.conflicts ?? []) : [],
    }),
  );
}

export function removeBlock(id: string) {
  return adminAction({ action: "unblock", id });
}

export function setException(exception: {
  date: string;
  closed: boolean;
  start?: number;
  end?: number;
  breaks?: { start: number; end: number }[];
  note?: string;
}) {
  return adminAction({ action: "exception", ...exception });
}

export function removeException(date: string) {
  return adminAction({ action: "deleteException", date });
}

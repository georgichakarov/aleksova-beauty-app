import type { Appointment, Block, Service, Status, StudioState } from "./types";
import { formatInTimeZone } from "date-fns-tz";

/** Statuses that hold a slot on the calendar. Cancelled/declined release it. */
export const RESERVING: Status[] = ["pending", "confirmed", "completed", "no_show"];

export const toMin = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
export const fmtMin = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export const dayIndex = (date: string) => (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;
export const overlap = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

export const isoDate = (d: Date) => formatInTimeZone(d, "Europe/Sofia", "yyyy-MM-dd");

export const effectiveBuffer = (s: Service, state: StudioState) => s.buffer ?? state.defaultBuffer;

export interface Conflict {
  kind: "closed" | "hours" | "break" | "block" | "appointment" | "past";
  message: string;
  appointmentId?: string;
}

export interface SlotQuery {
  date: string;
  start: number;
  duration: number;
  buffer: number;
  ignoreId?: string;
  now?: { date: string; min: number } | undefined;
}

export function checkSlot(state: StudioState, q: SlotQuery): Conflict[] {
  const out: Conflict[] = [];
  const h = state.hours[dayIndex(q.date)]!;
  const end = q.start + q.duration;
  const endBuf = end + q.buffer;
  if (!h.open) out.push({ kind: "closed", message: "The studio is closed on this day." });
  else if (q.start < h.start || end > h.end)
    out.push({
      kind: "hours",
      message: `Outside working hours (${fmtMin(h.start)}–${fmtMin(h.end)}).`,
    });
  else
    for (const b of h.breaks)
      if (overlap(q.start, end, b.start, b.end))
        out.push({
          kind: "break",
          message: `Overlaps a break (${fmtMin(b.start)}–${fmtMin(b.end)}).`,
        });

  for (const bl of state.blocks)
    if (bl.date === q.date && (bl.allDay || overlap(q.start, endBuf, bl.start, bl.end)))
      out.push({
        kind: "block",
        message: bl.allDay
          ? "This day is blocked."
          : `Blocked time ${fmtMin(bl.start)}–${fmtMin(bl.end)}.`,
      });

  for (const a of state.appointments) {
    if (a.id === q.ignoreId || a.date !== q.date || !RESERVING.includes(a.status)) continue;
    if (overlap(q.start, endBuf, a.start, a.start + a.duration + a.buffer))
      out.push({
        kind: "appointment",
        appointmentId: a.id,
        message: `Overlaps ${a.clientName} – ${a.serviceName} at ${fmtMin(a.start)}.`,
      });
  }

  if (q.now && (q.date < q.now.date || (q.date === q.now.date && q.start <= q.now.min)))
    out.push({ kind: "past", message: "This time has already passed." });
  return out;
}

/** Start times a client can pick for a service on a date. */
export function availableStarts(
  state: StudioState,
  service: Service,
  date: string,
  now: { date: string; min: number },
  step = 15,
): number[] {
  const h = state.hours[dayIndex(date)]!;
  if (!h.open) return [];
  const buffer = effectiveBuffer(service, state);
  const res: number[] = [];
  for (let t = h.start; t + service.duration <= h.end; t += step)
    if (checkSlot(state, { date, start: t, duration: service.duration, buffer, now }).length === 0)
      res.push(t);
  return res;
}

/** Active appointments a proposed block would collide with. */
export function blockConflicts(state: StudioState, b: Omit<Block, "id">): Appointment[] {
  return state.appointments.filter(
    (a) =>
      a.date === b.date &&
      (a.status === "pending" || a.status === "confirmed") &&
      (b.allDay || overlap(b.start, b.end, a.start, a.start + a.duration)),
  );
}

export const paidFor = (state: StudioState, id: string) =>
  state.payments.filter((p) => p.appointmentId === id).reduce((s, p) => s + p.amount, 0);

export const balanceOf = (state: StudioState, a: Appointment) =>
  Math.max(0, Math.round((a.price - paidFor(state, a.id)) * 100) / 100);

export type PaymentStatus = "unpaid" | "partial" | "paid";
export function paymentStatus(state: StudioState, a: Appointment): PaymentStatus {
  const paid = paidFor(state, a.id);
  if (paid <= 0) return "unpaid";
  return paid + 0.001 >= a.price ? "paid" : "partial";
}

export interface IncomeSummary {
  received: number;
  expected: number;
  outstanding: number;
  byService: { name: string; amount: number }[];
}

/**
 * received   – payments whose payment date is in `month` (YYYY-MM)
 * expected   – unpaid remainder of confirmed appointments from now on
 * outstanding – unpaid remainder of completed appointments
 */
export function incomeSummary(
  state: StudioState,
  month: string,
  now: { date: string; min: number },
): IncomeSummary {
  const inMonth = state.payments.filter((p) => p.date.startsWith(month));
  const received = inMonth.reduce((s, p) => s + p.amount, 0);
  const expected = state.appointments
    .filter(
      (a) =>
        a.status === "confirmed" &&
        (a.date > now.date || (a.date === now.date && a.start >= now.min)),
    )
    .reduce((s, a) => s + balanceOf(state, a), 0);
  const outstanding = state.appointments
    .filter((a) => a.status === "completed")
    .reduce((s, a) => s + balanceOf(state, a), 0);
  const map = new Map<string, number>();
  for (const p of inMonth) {
    const a = state.appointments.find((x) => x.id === p.appointmentId);
    const name = a?.serviceName ?? "Unknown";
    map.set(name, (map.get(name) ?? 0) + p.amount);
  }
  const byService = [...map.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
  return { received, expected, outstanding, byService };
}

export const money = (n: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(n);

export function nowParts(d = new Date()) {
  return {
    date: isoDate(d),
    min:
      Number(formatInTimeZone(d, "Europe/Sofia", "HH")) * 60 +
      Number(formatInTimeZone(d, "Europe/Sofia", "mm")),
  };
}

import { describe, expect, it } from "vitest";
import { availableStarts, blockConflicts, checkSlot, incomeSummary } from "./logic";
import type { Status, StudioState } from "./types";

const base = (): StudioState => ({
  services: [
    {
      id: "s",
      name: "Lift",
      description: "",
      price: 40,
      duration: 60,
      buffer: null,
      bookable: true,
      archived: false,
    },
  ],
  appointments: [],
  payments: [],
  hours: Array.from({ length: 7 }, () => ({ open: true, start: 540, end: 1080, breaks: [] })),
  defaultBuffer: 15,
  minNoticeHours: 12,
  bookingHorizonDays: 90,
  pendingExpiryMinutes: 60,
  blocks: [],
  exceptions: [],
});
const D = "2030-01-07"; // Monday
const appt = (id: string, status: Status, start = 600, price = 40) => ({
  id,
  clientName: "X",
  phone: "",
  email: "",
  serviceId: "s",
  serviceName: "Lift",
  price,
  duration: 60,
  buffer: 15,
  date: D,
  start,
  status,
  source: "website" as const,
  notes: "",
  createdAt: 0,
});
const now = { date: "2029-01-01", min: 0 };

describe("availability", () => {
  it("pending booking reserves its slot including buffer", () => {
    const s = base();
    s.appointments.push(appt("a", "pending"));
    expect(checkSlot(s, { date: D, start: 675, duration: 60, buffer: 0 }).length).toBe(0);
    expect(checkSlot(s, { date: D, start: 660, duration: 60, buffer: 0 }).length).toBe(1);
  });
  it("cancelled booking releases its slot", () => {
    const s = base();
    s.appointments.push(appt("a", "cancelled"));
    expect(availableStarts(s, s.services[0]!, D, now)).toContain(600);
  });
  it("blocked time is not offered to clients", () => {
    const s = base();
    s.blocks.push({ id: "b", date: D, allDay: false, start: 600, end: 720, reason: "" });
    const starts = availableStarts(s, s.services[0]!, D, now);
    expect(starts).not.toContain(600);
    expect(starts).not.toContain(660);
  });
  it("block over an active appointment is reported as a conflict", () => {
    const s = base();
    s.appointments.push(appt("a", "confirmed"));
    expect(
      blockConflicts(s, { date: D, allDay: true, start: 0, end: 0, reason: "" }).map((a) => a.id),
    ).toEqual(["a"]);
  });
});

describe("income", () => {
  it("received uses payment dates; expected excludes cancelled; completed balance is outstanding", () => {
    const s = base();
    s.appointments.push(
      appt("c", "completed", 540, 40),
      appt("f", "confirmed", 700, 30),
      appt("x", "cancelled", 900, 99),
    );
    s.payments.push({
      id: "p",
      appointmentId: "c",
      amount: 25,
      date: "2030-01-07",
      method: "cash",
      createdAt: 0,
    });
    const r = incomeSummary(s, "2030-01", now);
    expect(r.received).toBe(25);
    expect(r.expected).toBe(30);
    expect(r.outstanding).toBe(15);
  });
});

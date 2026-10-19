export type Status =
  "pending" | "confirmed" | "completed" | "cancelled" | "declined" | "no_show" | "expired";
export type PaymentMethod = "cash" | "card" | "bank" | "other";
export type Source = "website" | "instagram" | "phone" | "other";

export interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: number; // minutes
  buffer: number | null; // null = use default buffer
  bookable: boolean;
  archived: boolean;
}

export interface Appointment {
  id: string;
  clientName: string;
  phone: string;
  email: string;
  serviceId: string;
  // Snapshot at booking time — later service edits never change these.
  serviceName: string;
  price: number;
  duration: number;
  buffer: number;
  date: string; // YYYY-MM-DD
  start: number; // minutes from midnight
  status: Status;
  source: Source;
  notes: string;
  createdAt: number;
}

export interface Payment {
  id: string;
  appointmentId: string;
  amount: number;
  date: string; // YYYY-MM-DD
  method: PaymentMethod;
  createdAt: number;
  note?: string;
  kind?: "payment" | "refund";
}

export interface Range {
  start: number;
  end: number;
}

export interface DayHours {
  open: boolean;
  start: number;
  end: number;
  breaks: Range[];
}

export interface Block {
  id: string;
  date: string;
  allDay: boolean;
  start: number;
  end: number;
  reason: string;
}

export interface StudioState {
  services: Service[];
  appointments: Appointment[];
  payments: Payment[];
  hours: DayHours[]; // index 0 = Monday … 6 = Sunday
  defaultBuffer: number;
  minNoticeHours: number;
  bookingHorizonDays: number;
  pendingExpiryMinutes: number;
  blocks: Block[];
  exceptions: {
    date: string;
    is_closed: boolean;
    start_minute: number | null;
    end_minute: number | null;
    breaks: Range[];
    note: string;
  }[];
}

export const STATUS_LABEL: Record<Status, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  declined: "Declined",
  no_show: "No-show",
  expired: "Expired",
};

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  bank: "Bank transfer",
  other: "Other",
};

export const SOURCE_LABEL: Record<Source, string> = {
  website: "Website",
  instagram: "Instagram",
  phone: "Phone",
  other: "Other",
};

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

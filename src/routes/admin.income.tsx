import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AppointmentDrawer } from "@/components/admin/AppointmentDrawer";
import { Confirm, Empty, PageTitle, Stat } from "@/components/admin/shared";
import { deletePayment, updatePayment, useStudio } from "@/lib/studio/store-api";
import { balanceOf, incomeSummary, money, nowParts } from "@/lib/studio/logic";
import { METHOD_LABEL, type Payment, type PaymentMethod } from "@/lib/studio/types";

export const Route = createFileRoute("/admin/income")({
  head: () => ({
    meta: [
      { title: "Income — Admin demo" },
      { name: "description", content: "Payments received and expected income." },
    ],
  }),
  component: Income,
});

function Income() {
  const st = useStudio();
  const now = nowParts();
  const [month, setMonth] = useState(now.date.slice(0, 7));
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const inc = incomeSummary(st, month, now);
  const owing = st.appointments.filter((a) => a.status === "completed" && balanceOf(st, a) > 0);
  const rows = st.payments
    .filter((p) => p.date.startsWith(month))
    .map((p) => ({ p, a: st.appointments.find((a) => a.id === p.appointmentId) }))
    .filter(
      ({ a, p }) =>
        !q ||
        `${a?.clientName} ${a?.serviceName} ${METHOD_LABEL[p.method]}`
          .toLowerCase()
          .includes(q.toLowerCase()),
    )
    .sort((x, y) => y.p.date.localeCompare(x.p.date));

  return (
    <>
      <PageTitle title="Income">
        <Input
          type="month"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          className="w-44"
          aria-label="Month"
        />
      </PageTitle>
      <p className="mb-4 text-sm text-muted-foreground">
        Revenue only — expenses aren't tracked, so this isn't profit.
      </p>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat
          label="Net received"
          value={money(inc.received)}
          hint={`Payments minus refunds dated ${format(new Date(month + "-01T00:00"), "MMMM yyyy")}`}
        />
        <Stat
          label="Expected income"
          value={money(inc.expected)}
          hint="Upcoming confirmed, still unpaid"
        />
        <Stat
          label="Outstanding"
          value={money(inc.outstanding)}
          hint="Completed but not fully paid"
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="surface p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-2xl font-semibold">Payments</h2>
            <Input
              placeholder="Search client, service, method"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="sm:w-64"
            />
          </div>
          {rows.length === 0 ? (
            <Empty>No payments for this period.</Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="hidden sm:table-cell">Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ p, a }) =>
                  edit === p.id ? (
                    <EditRow key={p.id} p={p} done={() => setEdit(null)} />
                  ) : (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(p.date + "T00:00"), "d MMM")}
                      </TableCell>
                      <TableCell>
                        <button
                          className="text-left hover:text-primary"
                          onClick={() => a && setOpenId(a.id)}
                        >
                          {a?.clientName ?? "—"}
                          <span className="block text-xs text-muted-foreground">
                            {a?.serviceName}
                          </span>
                        </button>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {METHOD_LABEL[p.method]}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {money(p.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setEdit(p.id)}>
                          Correct
                        </Button>
                      </TableCell>
                    </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          )}
        </section>
        <div className="space-y-6">
          <section className="surface p-4">
            <h2 className="mb-3 text-xl font-semibold">By service</h2>
            {inc.byService.length === 0 ? (
              <Empty>Nothing received yet.</Empty>
            ) : (
              <ul className="space-y-2 text-sm">
                {inc.byService.map((s) => (
                  <li key={s.name}>
                    <div className="flex justify-between">
                      <span>{s.name}</span>
                      <span className="font-medium tabular-nums">{money(s.amount)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(s.amount / inc.received) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="surface p-4">
            <h2 className="mb-3 text-xl font-semibold">Awaiting payment</h2>
            {owing.length === 0 ? (
              <Empty>All completed appointments are paid.</Empty>
            ) : (
              <ul className="divide-y text-sm">
                {owing.map((a) => (
                  <li key={a.id}>
                    <button
                      onClick={() => setOpenId(a.id)}
                      className="flex w-full justify-between gap-2 py-2 text-left"
                    >
                      <span>
                        {a.clientName}
                        <span className="block text-xs text-muted-foreground">
                          {a.serviceName} · {format(new Date(a.date + "T00:00"), "d MMM")}
                        </span>
                      </span>
                      <span className="font-medium">{money(balanceOf(st, a))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
      <AppointmentDrawer id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function EditRow({ p, done }: { p: Payment; done: () => void }) {
  const [amount, setAmount] = useState(String(Math.abs(p.amount)));
  const [date, setDate] = useState(p.date);
  const [method, setMethod] = useState<PaymentMethod>(p.method);
  const n = Math.round(Number(amount) * 100) / 100;
  const valid = n > 0 && !!date;
  return (
    <TableRow>
      <TableCell colSpan={5}>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-40"
          />
          <Input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-28"
          />
          <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
            <SelectTrigger className="w-36">
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
          <Confirm
            destructive={false}
            trigger={
              <Button size="sm" disabled={!valid}>
                Save
              </Button>
            }
            title="Correct this transaction?"
            description={`The ledger will record a reversal and a replacement for ${money(n || 0)} on ${date}.`}
            confirmLabel="Save correction"
            onConfirm={() =>
              updatePayment(p.id, { amount: n, date, method })
                .then(() => {
                  toast.success("Transaction corrected");
                  done();
                })
                .catch((error) => toast.error(error.message))
            }
          />
          <Confirm
            trigger={
              <Button size="sm" variant="ghost" className="text-destructive">
                Reverse
              </Button>
            }
            title="Reverse this transaction?"
            description="A matching refund or reversal entry will be added to the audit trail."
            confirmLabel="Reverse entry"
            onConfirm={() =>
              deletePayment(p.id)
                .then(() => {
                  toast("Transaction reversed");
                  done();
                })
                .catch((error) => toast.error(error.message))
            }
          />
          <Button size="sm" variant="ghost" onClick={done}>
            Cancel
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

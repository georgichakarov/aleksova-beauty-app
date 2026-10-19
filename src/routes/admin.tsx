import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarDays, Clock, LayoutGrid, LogOut, Sparkles, Wallet } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { createAuthClient } from "better-auth/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMounted } from "@/lib/studio/store-api";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Owner dashboard — Aleksova Beauty Studio" },
      {
        name: "description",
        content: "Private studio dashboard for appointments, availability, services and income.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Owner dashboard — Aleksova Beauty Studio" },
      { property: "og:description", content: "Private studio dashboard." },
    ],
  }),
  component: AdminLayout,
});

const NAV = [
  { to: "/admin", label: "Overview", icon: LayoutGrid, exact: true },
  { to: "/admin/appointments", label: "Appointments", icon: CalendarDays },
  { to: "/admin/availability", label: "Availability", icon: Clock },
  { to: "/admin/services", label: "Services", icon: Sparkles },
  { to: "/admin/income", label: "Income", icon: Wallet },
] as const;
const authClient = createAuthClient();

function AdminLayout() {
  const mounted = useMounted();
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);
  useEffect(() => {
    void fetch("/api/session")
      .then((response) => {
        if (response.ok) setAuthorized(true);
        else void navigate({ to: "/login", replace: true });
      })
      .catch(() => void navigate({ to: "/login", replace: true }));
  }, [navigate]);
  const signOut = async () => {
    await authClient.signOut();
    setAuthorized(false);
    await navigate({ to: "/login", replace: true });
  };
  return (
    <div className="min-h-screen bg-background md:flex">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r bg-sidebar p-4 md:flex">
        <Link to="/" className="mb-8 px-2 font-display text-2xl font-semibold leading-tight">
          Aleksova
          <br />
          <span className="text-base font-medium text-muted-foreground">Beauty Studio</span>
        </Link>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: "exact" in n }}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
              activeProps={{
                className:
                  "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary",
              }}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-2">
          <p className="px-2 text-xs text-muted-foreground">Owner workspace · Europe/Sofia</p>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => void signOut()}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>
      <div className="min-w-0 flex-1 pb-24 md:pb-8">
        <main className="mx-auto max-w-6xl px-4 py-6 md:px-8">
          {mounted && authorized ? (
            <Outlet />
          ) : (
            <div className="space-y-4">
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-64 w-full" />
            </div>
          )}
        </main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t bg-card md:hidden">
        {NAV.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            activeOptions={{ exact: "exact" in n }}
            className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground"
            activeProps={{ className: "text-primary font-semibold" }}
          >
            <n.icon className="h-5 w-5" />
            {n.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground"
        >
          <LogOut className="h-5 w-5" />
          Sign out
        </button>
      </nav>
    </div>
  );
}

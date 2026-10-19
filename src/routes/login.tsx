import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LockKeyhole } from "lucide-react";
import { createAuthClient } from "better-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Owner sign in — Aleksova Beauty Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Login,
});

const authClient = createAuthClient();

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void fetch("/api/session").then((response) => {
      if (response.ok) void navigate({ to: "/admin", replace: true });
    });
  }, [navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const result = await authClient.signIn.email({
      email: email.trim(),
      password,
      callbackURL: "/admin",
    });
    setSubmitting(false);
    if (result.error) {
      setError("Email or password is incorrect.");
      return;
    }
    await navigate({ to: "/admin", replace: true });
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <section className="w-full max-w-sm">
        <Link to="/" className="font-serif text-2xl">
          Aleksova <span className="italic text-taupe">Beauty Studio</span>
        </Link>
        <div className="mt-10 border-t pt-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blush/60">
            <LockKeyhole className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-3xl">Owner sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Private access to the studio dashboard.
          </p>
          <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 h-11 bg-surface"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 h-11 bg-surface"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" variant="hero" className="w-full" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}

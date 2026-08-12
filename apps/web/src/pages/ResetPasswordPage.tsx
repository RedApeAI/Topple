import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api/client";
import {
  requestPasswordReset,
  resetPassword,
} from "@/features/settings/services/settings.service";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(undefined);
    setError(undefined);
    try {
      if (token) {
        await resetPassword({ token, newPassword: password });
        setMessage("Your password was reset. You can sign in now.");
      } else {
        await requestPasswordReset(email);
        setMessage("If the account exists, reset instructions will be sent.");
      }
    } catch (cause) {
      setError(errorMessage(cause, "Password reset could not be completed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-row">
        <h1 className="font-heading text-xl font-semibold text-foreground">
          {token ? "Set a new password" : "Reset your password"}
        </h1>
        <p className="mt-2 text-[13px] leading-5 text-muted-foreground">
          {token
            ? "Choose a new password for your Plucia account."
            : "Enter your account email and we will start the reset flow."}
        </p>
        <form
          className="mt-5 space-y-3"
          onSubmit={(event) => void submit(event)}
        >
          {!token ? (
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              required
            />
          ) : (
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="New password"
              required
            />
          )}
          {message ? (
            <p className="text-[13px] text-success">{message}</p>
          ) : null}
          {error ? (
            <p className="text-[13px] text-destructive">{error}</p>
          ) : null}
          <Button type="submit" disabled={busy} className="w-full">
            {token ? "Reset password" : "Send reset instructions"}
          </Button>
        </form>
        <Link
          to="/welcome"
          className="mt-4 block text-center text-[13px] font-medium text-foreground underline underline-offset-2"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  );
}

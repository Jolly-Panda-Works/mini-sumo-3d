import { useState, type FormEvent } from "react";
import { confirmSignInCode, sendSignInCode, type SignInPurpose } from "../network/accountEmail";
import { pushToast, showError } from "../uiStore";
import { Dialog } from "./Dialog";

/**
 * Sign in with email: the email, then the 6-digit code from the email.
 * A new email saves this player with it; an email that already has a player brings that
 * player to this device (the game restarts with them). A link from the email opens this
 * with the code filled in.
 */
export function EmailSavePopup({
  onClose,
  onLinked,
  initial,
}: {
  onClose: () => void;
  onLinked?: (email: string) => void;
  initial?: { email: string; code: string; purpose: SignInPurpose };
}) {
  const [email, setEmail] = useState(initial?.email ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [purpose, setPurpose] = useState<SignInPurpose>(initial?.purpose ?? "link");
  const [step, setStep] = useState<"email" | "code">(initial ? "code" : "email");
  const [busy, setBusy] = useState(false);

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      setPurpose(await sendSignInCode(email));
      setStep("code");
      pushToast("Code sent. Check your email.", "info", 4000);
    } catch (error) {
      void showError("Couldn't send the code", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    if (code.replace(/\D/g, "").length !== 6) return;
    setBusy(true);
    try {
      if (purpose === "restore") pushToast("Welcome back! Loading your wrestler…", "info", 4000);
      const linked = await confirmSignInCode(purpose, email, code); // "restore": the game restarts
      if (purpose === "link") {
        pushToast("Signed in. Your progress is saved with your email.", "info", 3500);
        onLinked?.(linked);
        onClose();
      }
    } catch (error) {
      void showError("That didn't work", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Sign in with email" onClose={onClose} className="email-save" variant="sub">
      {step === "email" ? (
        <form className="email-save__form" onSubmit={(e) => void send(e)}>
          <p className="hint hint--center">
            We'll email you a code. Your wrestler, coins and items are saved with your email, and you can get them back on any device.
          </p>
          <input
            className="input input--art"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email"
          />
          <button type="submit" className="plank-btn plank-btn--primary" disabled={busy || !email.trim()}>
            {busy ? "Sending…" : "Send code"}
          </button>
        </form>
      ) : (
        <form className="email-save__form" onSubmit={(e) => void confirm(e)}>
          <p className="hint hint--center">
            {purpose === "restore"
              ? `${email} already has a wrestler. Enter the code we sent to play as them here.`
              : `Enter the 6-digit code we sent to ${email}. It works for 15 minutes.`}
          </p>
          <input
            className="input input--art email-save__code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
            aria-label="Code"
          />
          <button type="submit" className="plank-btn plank-btn--primary" disabled={busy || code.length !== 6}>
            {busy ? "Checking…" : "Sign in"}
          </button>
          <button type="button" className="email-save__again" disabled={busy} onClick={() => void send()}>
            Send a new code
          </button>
        </form>
      )}
    </Dialog>
  );
}

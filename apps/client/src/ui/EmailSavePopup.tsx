import { useState, type FormEvent } from "react";
import { confirmLinkCode, confirmRestoreCode, sendLinkCode, sendRestoreCode } from "../network/accountEmail";
import { pushToast, showError, showWarning } from "../uiStore";
import { Dialog } from "./Dialog";

/**
 * Save with email (mode "link") or restore on this device (mode "restore"): the email, then
 * the 6-digit code from the email. A link from the email opens it with both filled in.
 */
export function EmailSavePopup({
  mode,
  onClose,
  onLinked,
  initial,
}: {
  mode: "link" | "restore";
  onClose: () => void;
  onLinked?: (email: string) => void;
  initial?: { email: string; code: string };
}) {
  const [email, setEmail] = useState(initial?.email ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [step, setStep] = useState<"email" | "code">(initial ? "code" : "email");
  const [busy, setBusy] = useState(false);

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      await (mode === "link" ? sendLinkCode(email) : sendRestoreCode(email));
      setStep("code");
      pushToast(mode === "link" ? "Code sent. Check your email." : "If this email saves a player, a code is on its way.", "info", 4000);
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
      if (mode === "link") {
        const result = await confirmLinkCode(email, code);
        pushToast("Your progress is saved with your email", "info", 3500);
        onLinked?.(result.email);
        onClose();
      } else {
        const choice = await showWarning(
          "Switch to that player?",
          "The progress saved with this email replaces the player on this device. If the player here isn't saved, it can't be brought back.",
          [
            { id: "leave", label: "Switch", primary: true },
            { id: "cancel", label: "Not now" },
          ],
        );
        if (choice !== "leave") return;
        await confirmRestoreCode(email, code); // the game restarts as that player
      }
    } catch (error) {
      void showError("That didn't work", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "link" ? "Save with email" : "Restore progress";
  return (
    <Dialog title={title} onClose={onClose} className="email-save" variant="sub">
      {step === "email" ? (
        <form className="email-save__form" onSubmit={(e) => void send(e)}>
          <p className="hint hint--center">
            {mode === "link"
              ? "We'll email you a code. With it, your wrestler, coins and items can come back on any device."
              : "Enter the email your progress is saved with. We'll send you a code."}
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
          <p className="hint hint--center">Enter the 6-digit code we sent to {email}. It works for 15 minutes.</p>
          <input
            className="input input--art email-save__code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
            aria-label="Code"
          />
          <button type="submit" className="plank-btn plank-btn--primary" disabled={busy || code.length !== 6}>
            {busy ? "Checking…" : mode === "link" ? "Save" : "Restore"}
          </button>
          <button type="button" className="email-save__again" disabled={busy} onClick={() => void send()}>
            Send a new code
          </button>
        </form>
      )}
    </Dialog>
  );
}

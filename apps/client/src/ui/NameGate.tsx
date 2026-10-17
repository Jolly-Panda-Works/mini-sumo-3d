import { useState, type FormEvent } from "react";
import { NAME_MAX_LENGTH } from "@mini-sumo/shared";
import { settingsStore } from "../settings";
import { Dialog } from "./Dialog";

/** First launch: ask for the player's name once and remember it. */
export function NameGate() {
  const [name, setName] = useState(settingsStore.get().name);
  const trimmed = name.trim();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!trimmed) return;
    settingsStore.update({ name: trimmed.slice(0, NAME_MAX_LENGTH), onboarded: true });
  };

  return (
    <Dialog title="Welcome!" onClose={() => undefined} hideClose className="name-gate">
      <form className="name-gate__form" onSubmit={submit}>
        <img className="name-gate__logo" src={`${import.meta.env.BASE_URL}logo.webp`} alt="" width={120} height={120} />
        <p className="name-gate__title">What should we call you?</p>
        <label className="field">
          <span className="field__label">Your name</span>
          <input
            className="input input--art"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, NAME_MAX_LENGTH))}
            placeholder="Little Yokozuna"
            maxLength={NAME_MAX_LENGTH}
            autoComplete="nickname"
            enterKeyHint="done"
            autoFocus
          />
        </label>
        <button type="submit" className="art art--save" aria-label="Save name" disabled={!trimmed}>
          <img src={`${import.meta.env.BASE_URL}ui/btn-save.webp`} alt="" width={329} height={124} draggable={false} />
        </button>
      </form>
    </Dialog>
  );
}

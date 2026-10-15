import { useState, type FormEvent } from "react";
import { NAME_MAX_LENGTH } from "@mini-sumo/shared";
import { settingsStore } from "../settings";

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
    <div className="overlay overlay--solid">
      <form className="panel name-gate" onSubmit={submit} aria-labelledby="name-gate-title">
        <img className="name-gate__logo" src={`${import.meta.env.BASE_URL}logo.webp`} alt="" width={120} height={120} />
        <h2 id="name-gate-title" className="name-gate__title">
          What should we call you?
        </h2>
        <p className="hint">Other wrestlers see this name above your head. You can change it later on the main menu.</p>
        <label className="field">
          <span className="field__label">Your name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, NAME_MAX_LENGTH))}
            placeholder="Little Yokozuna"
            maxLength={NAME_MAX_LENGTH}
            autoComplete="nickname"
            enterKeyHint="done"
            autoFocus
          />
        </label>
        <button type="submit" className="btn btn--primary btn--big" disabled={!trimmed}>
          Save name
        </button>
      </form>
    </div>
  );
}

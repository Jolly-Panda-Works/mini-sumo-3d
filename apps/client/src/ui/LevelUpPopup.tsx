import { useEffect, useState } from "react";
import { audio } from "../audio/AudioManager";
import { uiStore, showLevelUp } from "../uiStore";
import { useStore } from "../store";
import { Coins } from "./Coins";
import { Icon } from "./Icon";

/**
 * After a bout that raised your level: the old level floats up and fades, the new one rises
 * from below into its place (with the level-up sound), then the coin reward appears.
 */
export function LevelUpPopup() {
  const { levelUp } = useStore(uiStore);
  const [stage, setStage] = useState<"old" | "swap" | "done">("old");

  useEffect(() => {
    if (!levelUp) return;
    setStage("old");
    const swap = window.setTimeout(() => {
      setStage("swap");
      audio.sample("level-up");
    }, 700);
    const done = window.setTimeout(() => setStage("done"), 1500);
    return () => {
      window.clearTimeout(swap);
      window.clearTimeout(done);
    };
  }, [levelUp]);

  if (!levelUp) return null;
  const close = () => showLevelUp(null);

  return (
    <div className="overlay overlay--levelup" onClick={(e) => e.target === e.currentTarget && close()}>
      <section className="panel levelup" role="alertdialog" aria-modal="true" aria-labelledby="levelup-title" aria-describedby="levelup-desc">
        <h2 id="levelup-title" className="levelup__title">
          <Icon name="arrow-up" size={30} /> Level up!
        </h2>
        <div className="levelup__stage" aria-hidden="true">
          <span className={`levelup__num levelup__num--old${stage !== "old" ? " levelup__num--leave" : ""}`}>{levelUp.from}</span>
          <span className={`levelup__num levelup__num--new${stage !== "old" ? " levelup__num--enter" : ""}`}>{levelUp.to}</span>
        </div>
        <p id="levelup-desc" className="levelup__text">
          You reached level {levelUp.to}.
        </p>
        <p className={`levelup__reward${stage === "done" ? " levelup__reward--on" : ""}`}>
          {levelUp.coins > 0 && (
            <>
              Reward: <Coins amount={levelUp.coins} signed />
            </>
          )}
        </p>
        <button className="btn btn--primary btn--big" onClick={close} autoFocus>
          Great!
        </button>
      </section>
    </div>
  );
}

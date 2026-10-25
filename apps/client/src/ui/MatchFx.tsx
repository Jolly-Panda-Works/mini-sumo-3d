import { useEffect, useState } from "react";
import { bannerBus } from "../game/effectsBus";

const BANNER_MS = 1500;

/** Big words across the screen ("OSHIDASHI!", "RING SHRINKING!") and the white flash with them. */
export function MatchFx() {
  const [banner, setBanner] = useState<{ id: number; text: string; tone: "out" | "warn" } | null>(null);
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    let hide = 0;
    const off = bannerBus.on(({ text, tone, flash: withFlash }) => {
      const id = performance.now();
      setBanner({ id, text, tone });
      if (withFlash) setFlash(id);
      window.clearTimeout(hide);
      hide = window.setTimeout(() => setBanner(null), BANNER_MS);
    });
    return () => {
      off();
      window.clearTimeout(hide);
    };
  }, []);

  return (
    <>
      {flash > 0 && <div key={flash} className="screen-flash" aria-hidden="true" onAnimationEnd={() => setFlash(0)} />}
      {banner && (
        <div className="match-banner" aria-live="assertive">
          <span key={banner.id} className={`match-banner__text match-banner__text--${banner.tone}`}>
            {banner.text}
          </span>
        </div>
      )}
    </>
  );
}

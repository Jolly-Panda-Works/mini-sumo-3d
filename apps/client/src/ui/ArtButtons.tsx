import type { ReactNode } from "react";
import { Coins } from "./Coins";

const BASE = import.meta.env.BASE_URL;

/**
 * Buttons drawn from the art sheet. They all use the same scale, so their sizes keep the
 * art's proportions (BUY is wider than NOT NOW, COMING SOON is slimmer).
 */
type Props = {
  onClick?: () => void;
  label: string;
  disabled?: boolean;
  ariaDisabled?: boolean;
  sfx?: "none";
  className?: string;
};

function ArtButton({ art, onClick, label, disabled, ariaDisabled, sfx, className = "", children }: Props & { art: string; children?: ReactNode }) {
  return (
    <button
      type="button"
      className={`art ${className}`}
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
      aria-disabled={ariaDisabled || undefined}
      data-sfx={sfx}
    >
      <img src={`${BASE}ui/${art}.webp`} alt="" draggable={false} />
      {children}
    </button>
  );
}

/** BUY with the price in its dark field. */
export function BuyButton({ price, ...props }: Props & { price: number }) {
  return (
    <ArtButton art="btn-buy" {...props} className={`art--buy ${props.className ?? ""}`}>
      <span className="art--buy__price">
        {/* Short form (1k, 1.2k…) so the price always fits the button's field */}
        <Coins amount={price} compact />
      </span>
    </ArtButton>
  );
}

export function NotNowButton(props: Props) {
  return <ArtButton art="btn-not-now" {...props} className={`art--not-now ${props.className ?? ""}`} />;
}

export function ComingSoonButton(props: Props) {
  return <ArtButton art="btn-coming-soon" {...props} className={`art--coming-soon ${props.className ?? ""}`} />;
}

export function AboutButton(props: Props) {
  return <ArtButton art="btn-about" {...props} className={`art--about ${props.className ?? ""}`} />;
}

export function FreeLabel({ className = "" }: { className?: string }) {
  return <img className={`art-label-free ${className}`} src={`${BASE}ui/label-free.webp`} alt="Free" draggable={false} />;
}

/** The vibration switch: the phone frame with the on/off switch art; tap to toggle. */
export function VibrationToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" className="vib-toggle" role="switch" aria-checked={on} aria-label="Vibration" onClick={() => onChange(!on)}>
      <img className="vib-toggle__frame" src={`${BASE}ui/vibration-frame.webp`} alt="" draggable={false} />
      <img className="vib-toggle__switch" src={`${BASE}ui/vibration-${on ? "on" : "off"}.webp`} alt="" draggable={false} />
    </button>
  );
}

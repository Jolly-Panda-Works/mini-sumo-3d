import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  FACES,
  HAIR_COLORS,
  HAIR_STYLES,
  OUTFITS,
  PLAYER_COLORS,
  Phase,
  cosmeticItemId,
  cosmeticPrice,
  randomAppearance,
  restrictToOwned,
  type Appearance,
  type CosmeticCategory,
} from "@mini-sumo/shared";
import { buyItem, economyStore, ownedItems, saveAppearanceRemote } from "../network/economyClient";
import { Coins } from "./Coins";
import { SumoModel, useSumoParts } from "../game/SumoModel";
import { gameStore, roomManager } from "../network/RoomManager";
import { settingsStore } from "../settings";
import { useStore } from "../store";
import { setWardrobeOpen } from "../uiStore";

/** Slowly turning, idling preview of the player's wrestler. */
function PreviewSumo({ appearance, color }: { appearance: Appearance; color: string }) {
  const parts = useSumoParts();
  useFrame((frame) => {
    const t = frame.clock.elapsedTime;
    const root = parts.root.current;
    if (!root) return;
    root.rotation.set(0, Math.sin(t * 0.6) * 0.7, 0);
    if (parts.torso.current) parts.torso.current.scale.set(1, 1 + Math.sin(t * 3) * 0.02, 1);
    if (parts.eyes.current) parts.eyes.current.scale.y = t % 3.4 < 0.12 ? 0.2 : 1;
  });
  return <SumoModel parts={parts} color={color} appearance={appearance} showRing={false} />;
}

type Tab = { category: CosmeticCategory; label: string; options: readonly { label: string; hex?: string }[] };

const TABS: readonly Tab[] = [
  { category: "hair", label: "Hair", options: HAIR_STYLES },
  { category: "hairColor", label: "Colour", options: HAIR_COLORS },
  { category: "face", label: "Face", options: FACES },
  { category: "outfit", label: "Outfit", options: OUTFITS },
];

interface ItemGridProps {
  tab: Tab;
  value: number;
  worn: number;
  owned: ReadonlySet<string>;
  priceOf: (id: string) => number;
  onPick: (index: number) => void;
}

/** One category's items: owned first (in catalog order), then the rest by price. */
function ItemGrid({ tab, value, worn, owned, priceOf, onPick }: ItemGridProps) {
  const items = tab.options
    .map((option, index) => {
      const id = cosmeticItemId(tab.category, index);
      return { option, index, id, owned: owned.has(id), price: priceOf(id) };
    })
    .sort((a, b) => (a.owned === b.owned ? (a.owned ? a.index - b.index : a.price - b.price || a.index - b.index) : a.owned ? -1 : 1));

  return (
    <div className="items" role="tabpanel" aria-label={tab.label}>
      {items.map(({ option, index, owned: isOwned, price }) => (
        <button
          key={option.label}
          type="button"
          className={`item${index === value ? " item--on" : ""}${isOwned ? " item--owned" : ""}`}
          aria-pressed={index === value}
          aria-label={`${option.label}, ${isOwned ? (index === worn ? "wearing" : "owned") : `${price} Sumo Coins`}`}
          onClick={() => onPick(index)}
        >
          {option.hex && <span className="item__swatch" style={{ background: option.hex }} aria-hidden="true" />}
          <span className="item__name">{option.label}</span>
          <span className="item__price">
            {isOwned ? (index === worn ? "Wearing" : price === 0 ? "Free" : "Owned") : <Coins amount={price} />}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Customise hair, face and outfit before a match. Changes are saved locally and, in a
 * room lobby, sent to the server right away so everyone sees them.
 */
export function Wardrobe() {
  const { appearance } = useStore(settingsStore);
  const economy = useStore(economyStore);
  const game = useStore(gameStore);
  const owned = ownedItems();
  // Prices from the server catalog when online, otherwise the shared price table.
  const catalogPrices = new Map((economy.catalog?.items ?? []).map((i) => [i.id, i.price] as const));
  const priceOf = (id: string) => catalogPrices.get(id) ?? cosmeticPrice(id);
  const [tab, setTab] = useState<Tab>(TABS[0]!);
  const shopOpen = economy.status === "ready" && Boolean(economy.catalog?.flags.shop) && economy.profile !== null;
  const balance = economy.profile?.balances.coins ?? 0;
  // What the preview shows; may include items you don't own yet (try before you buy).
  const [draft, setDraft] = useState<Appearance>(appearance);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const you = game.players.find((p) => p.isYou);
  const color = PLAYER_COLORS[(you?.colorIndex ?? 0) % PLAYER_COLORS.length]!.hex;
  const inLobby = Boolean(you) && (game.phase === Phase.Waiting || game.phase === Phase.Lobby);

  useEffect(() => {
    doneRef.current?.focus();
  }, []);

  /** Saves the owned part of a look (locally, to the room and to the account). */
  const commit = (look: Appearance) => {
    const wearable = restrictToOwned(look, ownedItems());
    settingsStore.update({ appearance: wearable });
    if (inLobby) roomManager.setAppearance(wearable);
    void saveAppearanceRemote();
  };

  const update = (patch: Partial<Appearance>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    setBuyError(null);
    commit(next);
  };

  // First unowned item in the preview: offered for purchase.
  const missing = (Object.keys(draft) as CosmeticCategory[])
    .map((category) => cosmeticItemId(category, draft[category]))
    .find((id) => !owned.has(id));
  const missingItem = missing
    ? { id: missing, name: TABS.flatMap((t) => t.options.map((o, i) => [cosmeticItemId(t.category, i), o.label] as const)).find(([id]) => id === missing)?.[1] ?? missing, price: priceOf(missing) }
    : undefined;

  const buy = async () => {
    if (!missingItem) return;
    setBuying(true);
    setBuyError(null);
    try {
      await buyItem(missingItem.id);
      commit(draft);
    } catch (error) {
      setBuyError(error instanceof Error ? error.message : "The purchase failed. Try again.");
    } finally {
      setBuying(false);
    }
  };

  const close = () => {
    commit(draft);
    setWardrobeOpen(false);
  };

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && close()}>
      <section className="panel wardrobe" role="dialog" aria-modal="true" aria-labelledby="wardrobe-title">
        <h2 id="wardrobe-title" className="settings__title">
          Your wrestler
        </h2>

        <div className="wardrobe__body">
          <div className="wardrobe__preview" aria-hidden="true">
            <Canvas shadows dpr={[1, 2]} camera={{ fov: 32, position: [0, 1.25, 4.6] }}>
              <hemisphereLight args={["#F4F7FF", "#7B6A5A", 1.2]} />
              <directionalLight position={[2.5, 4, 3]} intensity={1.6} castShadow />
              <group position-y={-0.85}>
                <PreviewSumo appearance={draft} color={color} />
                <mesh rotation-x={-Math.PI / 2} receiveShadow>
                  <circleGeometry args={[1.4, 40]} />
                  <meshStandardMaterial color="#EFD6A8" roughness={1} />
                </mesh>
              </group>
            </Canvas>
          </div>

          <div className="wardrobe__options">
            <div className="tabs" role="tablist" aria-label="Categories">
              {TABS.map((t) => (
                <button
                  key={t.category}
                  type="button"
                  role="tab"
                  aria-selected={t.category === tab.category}
                  className={`tab${t.category === tab.category ? " tab--on" : ""}`}
                  onClick={() => setTab(t)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <ItemGrid
              tab={tab}
              value={draft[tab.category]}
              worn={appearance[tab.category]}
              owned={owned}
              priceOf={priceOf}
              onPick={(index) => update({ [tab.category]: index } as Partial<Appearance>)}
            />
            <p className="hint">
              Try anything on before you buy it. Bought items stay yours for good. Your belt keeps your player colour, and looks
              never change how your wrestler plays.
            </p>
          </div>
        </div>

        {missing && (
          <div className="shop-bar" role="status">
            {missingItem && (
              <>
                <span>
                  Previewing <strong>{missingItem.name}</strong> · <Coins amount={missingItem.price} />
                </span>
                {shopOpen ? (
                  <button className="btn btn--primary" disabled={buying || balance < missingItem.price} onClick={() => void buy()}>
                    {buying ? "Buying…" : "Buy"}
                  </button>
                ) : (
                  <button className="btn" disabled aria-label={`Buy ${missingItem.name}: coming soon`}>
                    Buy · Coming soon
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {buyError && (
          <p className="notice notice--error" role="alert">
            {buyError}
          </p>
        )}

        <div className="row">
          <button type="button" className="btn btn--grow" onClick={() => update(restrictToOwned(randomAppearance(), owned))}>
            Surprise me
          </button>
          <button ref={doneRef} type="button" className="btn btn--primary btn--grow" onClick={close}>
            Done
          </button>
        </div>
      </section>
    </div>
  );
}

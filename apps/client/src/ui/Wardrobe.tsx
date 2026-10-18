import { useState } from "react";
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
  restrictToOwned,
  type Appearance,
  type CosmeticCategory,
} from "@mini-sumo/shared";
import { buyItem, economyStore, ownedItems, saveAppearanceRemote } from "../network/economyClient";
import { Coins } from "./Coins";
import { Dialog } from "./Dialog";
import { PHONE_QUERY, useMediaQuery } from "../useMediaQuery";
import { BuyButton, ComingSoonButton, NotNowButton } from "./ArtButtons";
import { audio } from "../audio/AudioManager";
import { pushToast, setShopOpen, showWarning } from "../uiStore";
import { SumoModel, useSumoParts } from "../game/SumoModel";
import { gameStore, roomManager } from "../network/RoomManager";
import { settingsStore } from "../settings";
import { useStore } from "../store";
import { setWardrobeOpen } from "../uiStore";

/** Slowly turning, idling preview of the player's wrestler. */
export function PreviewSumo({ appearance, color }: { appearance: Appearance; color: string }) {
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

/** Try-on popup for an item you don't own yet: preview, name, price, Buy / Not now. */
function ItemPopup({
  item,
  look,
  color,
  balance,
  canBuy,
  onBuy,
  onClose,
}: {
  item: { id: string; name: string; price: number; category: CosmeticCategory; index: number };
  look: Appearance;
  color: string;
  balance: number;
  canBuy: boolean;
  onBuy: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const affordable = balance >= item.price;
  const tryOn = { ...look, [item.category]: item.index } as Appearance;

  const buy = async () => {
    setBusy(true);
    setError(null);
    try {
      await onBuy();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The purchase failed. Try again.");
      setBusy(false);
    }
  };

  return (
    <Dialog
      variant="sub"
      title={item.name}
      onClose={onClose}
      className="item-popup"
      hideClose
      footer={
        <div className="art-stack">
          {canBuy ? (
            <BuyButton
              price={item.price}
              label={`Buy ${item.name} for ${item.price} Sumo Coins`}
              disabled={busy}
              ariaDisabled={!affordable}
              sfx={affordable ? "none" : undefined}
              onClick={() => (affordable ? void buy() : void showWarning("Not enough coins", "You need more Sumo Coins for this. Get some in the coin shop.", [
                  { id: "shop", label: "Coin shop", primary: true },
                  { id: "cancel", label: "Not now" },
                ]).then((choice) => choice === "shop" && setShopOpen(true)))}
            />
          ) : (
            <ComingSoonButton label="Buying is coming soon" ariaDisabled onClick={() => pushToast("Coming soon", "info")} />
          )}
          <NotNowButton label="Not now" onClick={onClose} />
        </div>
      }
    >
      <div className="item-popup__preview">
        <span className="wardrobe__balance coin-frame coin-frame--static" aria-label={`Your coins: ${balance}`}>
          <span className="coin-frame__amount">{balance.toLocaleString("en-US")}</span>
        </span>
        <Canvas shadows dpr={[1, 2]} camera={{ fov: 32, position: [0, 1.25, 4.6] }}>
          <hemisphereLight args={["#F4F7FF", "#7B6A5A", 1.2]} />
          <directionalLight position={[2.5, 4, 3]} intensity={1.6} castShadow />
          <group position-y={-0.85}>
            <PreviewSumo appearance={tryOn} color={color} />
            <mesh rotation-x={-Math.PI / 2} receiveShadow>
              <circleGeometry args={[1.4, 40]} />
              <meshStandardMaterial color="#EFD6A8" roughness={1} />
            </mesh>
          </group>
        </Canvas>
      </div>
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}

/**
 * Customise hair, face and outfit. The preview and the category tabs stay in place; only the
 * item grid scrolls. Owned items are worn at once; other items open a try-on popup.
 */
export function Wardrobe() {
  const { appearance } = useStore(settingsStore);
  const economy = useStore(economyStore);
  const game = useStore(gameStore);
  const owned = ownedItems();
  const catalogPrices = new Map((economy.catalog?.items ?? []).map((i) => [i.id, i.price] as const));
  const priceOf = (id: string) => catalogPrices.get(id) ?? cosmeticPrice(id);
  const [tab, setTab] = useState<Tab>(TABS[0]!);
  const [pending, setPending] = useState<{ category: CosmeticCategory; index: number } | null>(null);
  const shopOpen = economy.status === "ready" && Boolean(economy.catalog?.flags.shop) && economy.profile !== null;
  const balance = economy.profile?.balances.coins ?? 0;
  const you = game.players.find((p) => p.isYou);
  const color = PLAYER_COLORS[(you?.colorIndex ?? 0) % PLAYER_COLORS.length]!.hex;
  const inLobby = Boolean(you) && (game.phase === Phase.Waiting || game.phase === Phase.Lobby);

  /** Saves the owned part of a look (locally, to the room and to the account). */
  const wear = (look: Appearance) => {
    const wearable = restrictToOwned(look, ownedItems());
    settingsStore.update({ appearance: wearable });
    if (inLobby) roomManager.setAppearance(wearable);
    void saveAppearanceRemote();
  };

  const pick = (category: CosmeticCategory, index: number) => {
    if (owned.has(cosmeticItemId(category, index))) wear({ ...appearance, [category]: index } as Appearance);
    else setPending({ category, index });
  };

  const pendingItem = pending
    ? {
        ...pending,
        id: cosmeticItemId(pending.category, pending.index),
        name: TABS.find((t) => t.category === pending.category)!.options[pending.index]!.label,
        price: priceOf(cosmeticItemId(pending.category, pending.index)),
      }
    : null;

  // Desktop: the category tabs hang on the panel's outer left edge; phones: under the preview.
  const sideTabs = !useMediaQuery(PHONE_QUERY);
  const tabs = (
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
  );

  return (
    <>
      <Dialog
        title="Your wrestler"
        onClose={() => setWardrobeOpen(false)}
        className="wardrobe"
        bodyClassName={`wardrobe__body${sideTabs ? " wardrobe__body--side-tabs" : ""}`}
        aside={sideTabs ? tabs : undefined}
      >
        <div className="wardrobe__preview" aria-hidden="true">
          <Canvas shadows dpr={[1, 2]} camera={{ fov: 32, position: [0, 1.25, 4.6] }}>
            <hemisphereLight args={["#F4F7FF", "#7B6A5A", 1.2]} />
            <directionalLight position={[2.5, 4, 3]} intensity={1.6} castShadow />
            <group position-y={-0.85}>
              <PreviewSumo appearance={appearance} color={color} />
              <mesh rotation-x={-Math.PI / 2} receiveShadow>
                <circleGeometry args={[1.4, 40]} />
                <meshStandardMaterial color="#EFD6A8" roughness={1} />
              </mesh>
            </group>
          </Canvas>
          <span className="wardrobe__balance coin-frame coin-frame--static" aria-label={`Your coins: ${balance}`}>
            <span className="coin-frame__amount">{balance.toLocaleString("en-US")}</span>
          </span>
        </div>

        {!sideTabs && tabs}

        <div className="wardrobe__items">
          <ItemGrid
            tab={tab}
            value={appearance[tab.category]}
            worn={appearance[tab.category]}
            owned={owned}
            priceOf={priceOf}
            onPick={(index) => pick(tab.category, index)}
          />
        </div>
      </Dialog>

      {pendingItem && (
        <ItemPopup
          item={pendingItem}
          look={appearance}
          color={color}
          balance={balance}
          canBuy={shopOpen}
          onClose={() => setPending(null)}
          onBuy={async () => {
            await buyItem(pendingItem.id);
            audio.sample("purchase");
            wear({ ...settingsStore.get().appearance, [pendingItem.category]: pendingItem.index } as Appearance);
            setPending(null);
          }}
        />
      )}
    </>
  );
}

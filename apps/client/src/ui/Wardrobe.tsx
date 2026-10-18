import { useEffect, useState } from "react";
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
import { BuyButton } from "./ArtButtons";
import { ThumbStudio, requestThumb, thumbKey, useThumb } from "./WardrobeThumbs";
import { PHONE_QUERY, useMediaQuery } from "../useMediaQuery";
import { audio } from "../audio/AudioManager";
import { pushToast, setShopOpen, showError, showMessage, showWarning } from "../uiStore";
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
  /** Your current look and colour: thumbnails show each item on your wrestler. */
  look: Appearance;
  color: string;
  value: number;
  worn: number;
  owned: ReadonlySet<string>;
  priceOf: (id: string) => number;
  onPick: (index: number) => void;
  /** The item being tried on (not owned yet), if any. */
  trying: number | null;
  onBuy: (index: number) => void;
}

/** One category's items: owned first (in catalog order), then the rest by price. */
function ItemGrid({ tab, look, color, value, worn, owned, priceOf, onPick, trying, onBuy }: ItemGridProps) {
  const items = tab.options
    .map((option, index) => {
      const id = cosmeticItemId(tab.category, index);
      return { option, index, id, owned: owned.has(id), price: priceOf(id) };
    })
    .sort((a, b) => (a.owned === b.owned ? (a.owned ? a.index - b.index : a.price - b.price || a.index - b.index) : a.owned ? -1 : 1));

  return (
    <div className="items" role="tabpanel" aria-label={tab.label}>
      {items.map(({ option, index, owned: isOwned, price }) => (
        <div
          key={option.label}
          className={`item${index === value ? " item--on" : ""}${index === trying ? " item--trying" : ""}${isOwned ? " item--owned" : ""}`}
        >
          <button
            type="button"
            className="item__pick"
            aria-pressed={index === value}
            aria-label={`${option.label}, ${isOwned ? (index === worn ? "wearing" : "owned") : index === trying ? "trying on" : `try on, ${price} Sumo Coins`}`}
            onClick={() => onPick(index)}
          >
            <ItemThumb category={tab.category} look={look} index={index} color={color} />
            {option.hex && <span className="item__swatch" style={{ background: option.hex }} aria-hidden="true" />}
            <span className="item__text">
              <span className="item__name">{option.label}</span>
              <span className="item__price">
                {isOwned ? (index === worn ? "Wearing" : price === 0 ? "Free" : "Owned") : index === trying ? "Trying on" : <Coins amount={price} />}
              </span>
            </span>
          </button>
          {!isOwned && <BuyButton className="item__buy" price={price} label={`Buy ${option.label} for ${price} Sumo Coins`} sfx="none" onClick={() => onBuy(index)} />}
        </div>
      ))}
    </div>
  );
}

/** The item drawn on your wrestler (rendered once, then cached). */
function ItemThumb({ category, look, index, color }: { category: CosmeticCategory; look: Appearance; index: number; color: string }) {
  const appearance = { ...look, [category]: index } as Appearance;
  // Hair colours show on your hairstyle; with none (bald), on a bowl cut so the colour shows.
  if (category === "hairColor" && HAIR_STYLES[appearance.hair]?.id === "bald") {
    appearance.hair = HAIR_STYLES.findIndex((h) => h.id === "bowl");
  }
  const key = thumbKey(category, appearance, color);
  const src = useThumb(key);
  useEffect(() => requestThumb({ key, appearance, category, color }), [key]);
  return (
    <span className="item__thumb" aria-hidden="true">
      {src ? <img src={src} alt="" width={128} height={128} /> : <span className="item__thumb-wait" />}
    </span>
  );
}

export function Wardrobe() {
  const { appearance } = useStore(settingsStore);
  const economy = useStore(economyStore);
  const game = useStore(gameStore);
  const owned = ownedItems();
  const catalogPrices = new Map((economy.catalog?.items ?? []).map((i) => [i.id, i.price] as const));
  const priceOf = (id: string) => catalogPrices.get(id) ?? cosmeticPrice(id);
  const [tab, setTab] = useState<Tab>(TABS[0]!);
  // Tapping an item you don't own tries it on (in the preview) until you buy it or pick another.
  const [trying, setTrying] = useState<{ category: CosmeticCategory; index: number } | null>(null);
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
    if (owned.has(cosmeticItemId(category, index))) {
      setTrying(null);
      wear({ ...appearance, [category]: index } as Appearance);
    } else {
      setTrying({ category, index });
      void confirmBuy(category, index);
    }
  };

  /** Asks before buying; the item stays on in the preview while you decide. */
  const confirmBuy = async (category: CosmeticCategory, index: number) => {
    const id = cosmeticItemId(category, index);
    const name = TABS.find((t) => t.category === category)!.options[index]!.label;
    const choice = await showMessage(
      "Buy this item?",
      `${name} for ${priceOf(id).toLocaleString("en-US")} Sumo Coins. You have ${balance.toLocaleString("en-US")}.`,
      [{ id: "buy", label: "Buy", primary: true, price: priceOf(id) }],
      { closable: true },
    );
    if (choice === "buy") await buy(category, index);
    else setTrying(null);
  };

  const buy = async (category: CosmeticCategory, index: number) => {
    const id = cosmeticItemId(category, index);
    const price = priceOf(id);
    if (!shopOpen) {
      pushToast("Buying is coming soon", "info");
      return;
    }
    if (balance < price) {
      void showWarning("Not enough coins", "You need more Sumo Coins for this. Get some in the coin shop.", [
        { id: "shop", label: "Coin shop", primary: true },
        { id: "cancel", label: "Not now" },
      ]).then((choice) => choice === "shop" && setShopOpen(true));
      return;
    }
    try {
      await buyItem(id);
      audio.sample("purchase");
      setTrying(null);
      wear({ ...settingsStore.get().appearance, [category]: index } as Appearance);
    } catch (error) {
      void showError("Couldn't buy", error instanceof Error ? error.message : "Try again.");
    }
  };

  // What the preview shows: your look, with the item being tried on.
  const previewLook = trying ? ({ ...appearance, [trying.category]: trying.index } as Appearance) : appearance;

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
              <PreviewSumo appearance={previewLook} color={color} />
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
            look={appearance}
            color={color}
            value={appearance[tab.category]}
            worn={appearance[tab.category]}
            owned={owned}
            priceOf={priceOf}
            onPick={(index) => pick(tab.category, index)}
            trying={trying && trying.category === tab.category ? trying.index : null}
            onBuy={(index) => {
              setTrying({ category: tab.category, index });
              void confirmBuy(tab.category, index);
            }}
          />
        </div>
      </Dialog>

      <ThumbStudio />
    </>
  );
}

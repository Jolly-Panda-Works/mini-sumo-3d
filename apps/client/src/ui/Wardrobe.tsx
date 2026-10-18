import { useEffect, useMemo, useRef, useState } from "react";
import { compactCoins } from "./Coins";
import { Color, Object3D, Vector3, type InstancedMesh } from "three";
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
/** A reaction when an item goes on: which part changed and when (performance.now()). */
export interface Reaction {
  category: CosmeticCategory;
  at: number;
}

const REACT_MS = 900;

/**
 * The turning wrestler in the wardrobe. When an item goes on it reacts, with a move for each
 * kind of item: hair and colour (a happy head wiggle and hop), face (a nod with a squash),
 * outfit (a jump with a full spin).
 */
export function PreviewSumo({
  appearance,
  color,
  reaction,
  sway = 0.7,
}: {
  appearance: Appearance;
  color: string;
  reaction?: Reaction | null;
  /** How far it turns either way while idle (radians); small for face close-ups. */
  sway?: number;
}) {
  const parts = useSumoParts();
  useFrame((frame) => {
    const t = frame.clock.elapsedTime;
    const root = parts.root.current;
    if (!root) return;
    let yaw = Math.sin(t * 0.6) * sway;
    let lift = 0;
    let squash = 0;
    let headTilt = 0;
    let headNod = 0;
    let arms = 0;
    const r = reaction ? (performance.now() - reaction.at) / REACT_MS : 1;
    if (reaction && r >= 0 && r < 1) {
      const wave = Math.sin(r * Math.PI); // 0 → 1 → 0
      if (reaction.category === "outfit") {
        // Jump and spin all the way round.
        lift = Math.sin(r * Math.PI) * 0.55;
        yaw += r * Math.PI * 2;
        squash = r < 0.15 ? Math.sin((r / 0.15) * Math.PI) * 0.18 : 0;
        arms = wave;
      } else if (reaction.category === "face") {
        // A big nod, squashing down and back up.
        headNod = Math.sin(r * Math.PI * 3) * 0.35 * (1 - r);
        squash = wave * 0.16;
        yaw *= 1 - wave;
      } else {
        // Hair and colour: wiggle the head, hop and show it off.
        headTilt = Math.sin(r * Math.PI * 4) * 0.35 * (1 - r);
        lift = Math.abs(Math.sin(r * Math.PI * 2)) * 0.18 * (1 - r);
        yaw *= 1 - wave;
        arms = wave * 0.6;
      }
    }
    root.rotation.set(0, yaw, 0);
    root.position.y = lift;
    if (parts.torso.current) parts.torso.current.scale.set(1 + squash * 0.6, 1 + Math.sin(t * 3) * 0.02 - squash, 1 + squash * 0.6);
    if (parts.head.current) parts.head.current.rotation.set(headNod, 0, headTilt);
    if (parts.armL.current) parts.armL.current.rotation.set(0, 0, 0.7 + arms * 1.6);
    if (parts.armR.current) parts.armR.current.rotation.set(0, 0, -0.7 - arms * 1.6);
    if (parts.eyes.current) parts.eyes.current.scale.y = t % 3.4 < 0.12 ? 0.2 : 1;
  });
  return <SumoModel parts={parts} color={color} appearance={appearance} showRing={false} />;
}

/** Where the wardrobe camera looks: the head (hair, colour, face) or the belt (outfits). */
const FOCUS: Record<CosmeticCategory, { position: [number, number, number]; target: [number, number, number] }> = {
  // The model stands at y = -0.85 in the preview: head centre ≈ 0.57, belt ≈ -0.25.
  hair: { position: [0, 0.98, 2.6], target: [0, 0.88, 0] },
  hairColor: { position: [0, 0.98, 2.6], target: [0, 0.88, 0] },
  face: { position: [0, 0.72, 2.35], target: [0, 0.72, 0] },
  outfit: { position: [0, 0.25, 2.7], target: [0, -0.2, 0] },
  // Not a wardrobe tab (portraits are picked on the profile), but keep the whole wrestler in view.
  avatar: { position: [0, 0.4, 3.4], target: [0, 0, 0] },
};

/** Glides the preview camera to the part being customised. */
export function PreviewCamera({ focus }: { focus: CosmeticCategory }) {
  const target = useMemo(() => new Vector3(), []);
  const goal = useMemo(() => new Vector3(), []);
  useFrame(({ camera }, delta) => {
    const shot = FOCUS[focus];
    const k = 1 - Math.exp(-6 * Math.min(delta, 0.1));
    goal.set(...shot.position);
    camera.position.lerp(goal, k);
    goal.set(...shot.target);
    target.lerp(goal, k);
    camera.lookAt(target);
  });
  return null;
}

const SPARKLES = 28;

/** A burst of sparkles from the part that just changed (head for hair, colour and face; belt for outfits). */
export function PreviewSparkles({ reaction, tint }: { reaction?: Reaction | null; tint: string }) {
  const ref = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const parts = useMemo(
    () => Array.from({ length: SPARKLES }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0.05 })),
    [],
  );
  useEffect(() => {
    if (!reaction) return;
    const y = reaction.category === "outfit" ? 0.65 : 1.55;
    for (const p of parts) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      const out = 1.2 + Math.random() * 1.8;
      p.x = Math.cos(a) * 0.3;
      p.z = Math.sin(a) * 0.3;
      p.y = y + (Math.random() - 0.5) * 0.3;
      p.vx = Math.cos(a) * out;
      p.vz = Math.sin(a) * out;
      p.vy = 1 + up * 2.5;
      p.max = 0.55 + Math.random() * 0.45;
      p.life = p.max;
      p.size = 0.035 + Math.random() * 0.05;
    }
  }, [reaction, parts]);
  useFrame((_, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    const dt = Math.min(delta, 0.1);
    parts.forEach((p, i) => {
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= 4 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vx *= 0.92;
        p.vz *= 0.92;
        const k = Math.max(0, p.life / p.max);
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(p.life * 8, p.life * 6, 0);
        // Twinkle: grow in, then shrink away.
        dummy.scale.setScalar(p.size * Math.sin(k * Math.PI) * 1.6);
      } else {
        dummy.position.set(0, -50, 0);
        dummy.scale.setScalar(0.0001);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, i % 3 === 0 ? WHITE_SPARK : i % 3 === 1 ? GOLD_SPARK : tintColor(tint));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, SPARKLES]} frustumCulled={false}>
      <octahedronGeometry args={[1, 0]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

const WHITE_SPARK = new Color("#ffffff");
const GOLD_SPARK = new Color("#ffd166");
const tintCache = new Map<string, Color>();
function tintColor(hex: string): Color {
  let c = tintCache.get(hex);
  if (!c) {
    c = new Color(hex);
    tintCache.set(hex, c);
  }
  return c;
}

type Tab = { category: CosmeticCategory; label: string; icon: string; options: readonly { label: string; hex?: string }[] };

const TABS: readonly Tab[] = [
  { category: "hair", label: "Hair", icon: "tab-hair", options: HAIR_STYLES },
  { category: "hairColor", label: "Colour", icon: "tab-color", options: HAIR_COLORS },
  { category: "face", label: "Face", icon: "tab-face", options: FACES },
  { category: "outfit", label: "Outfit", icon: "tab-outfit", options: OUTFITS },
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
    .sort((a, b) => {
      // The item you wear comes first, then the rest you own, then the rest by price.
      if (a.index === worn !== (b.index === worn)) return a.index === worn ? -1 : 1;
      if (a.owned !== b.owned) return a.owned ? -1 : 1;
      return a.owned ? a.index - b.index : a.price - b.price || a.index - b.index;
    });

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
              <span className="item__name item__name--plate">{option.label}</span>
              {/* Owned items need no label; items you don't own show their price (or that you're trying them) */}
              {!isOwned && index === trying && <span className="item__price">Trying on</span>}
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
  // Each tab opens at the top of its list (where the item you wear is).
  const itemsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    itemsRef.current?.scrollTo({ top: 0 });
  }, [tab.category]);

  // The preview reacts (and sparkles) whenever an item goes on.
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const react = (category: CosmeticCategory) => setReaction({ category, at: performance.now() });
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
      react(category);
    } else {
      setTrying({ category, index });
      react(category);
      void confirmBuy(category, index);
    }
  };

  /** Asks before buying; the item stays on in the preview while you decide. */
  const confirmBuy = async (category: CosmeticCategory, index: number) => {
    const id = cosmeticItemId(category, index);
    const name = TABS.find((t) => t.category === category)!.options[index]!.label;
    // The item's picture next to your coins; the price is on BUY.
    const choice = await showMessage(
      "Buy this item?",
      `${name} for ${priceOf(id).toLocaleString("en-US")} Sumo Coins. You have ${balance.toLocaleString("en-US")}.`,
      [{ id: "buy", label: "Buy", primary: true, price: priceOf(id) }],
      {
        closable: true,
        titleExtra: (
          <span className="coin-frame coin-frame--static buy-confirm__coins" aria-label={`Your coins: ${balance}`}>
            <span className="coin-frame__amount">{compactCoins(balance)}</span>
          </span>
        ),
        body: (
          <div className="buy-confirm">
            <div className="buy-confirm__item">
              <ItemThumb category={category} look={appearance} index={index} color={color} />
              <span className="buy-confirm__name">{name}</span>
            </div>
          </div>
        ),
      },
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
      react(category);
    } catch (error) {
      void showError("Couldn't buy", error instanceof Error ? error.message : "Try again.");
    }
  };

  // Sparkles take the hair colour when a colour goes on, gold otherwise.
  const sparkleTint = reaction?.category === "hairColor" ? (HAIR_COLORS[previewLookColor()]?.hex ?? "#ffd166") : "#ffd166";
  function previewLookColor(): number {
    return (trying?.category === "hairColor" ? trying.index : appearance.hairColor) ?? 0;
  }

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
                  className={`tab tab--art${t.category === tab.category ? " tab--on" : ""}`}
                  onClick={() => setTab(t)}
                  aria-label={t.label}
                  title={t.label}
                >
                  <img src={`${import.meta.env.BASE_URL}ui/wardrobe/${t.icon}.webp`} alt="" draggable={false} />
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
          <Canvas shadows dpr={[1, 2]} camera={{ fov: 32, position: [0, 0.98, 2.6] }}>
            <PreviewCamera focus={tab.category} />
            <hemisphereLight args={["#F4F7FF", "#7B6A5A", 1.2]} />
            <directionalLight position={[2.5, 4, 3]} intensity={1.6} castShadow />
            <group position-y={-0.85}>
              <PreviewSumo appearance={previewLook} color={color} reaction={reaction} sway={tab.category === "outfit" ? 0.5 : tab.category === "face" ? 0.12 : 0.28} />
              <PreviewSparkles reaction={reaction} tint={sparkleTint} />
            </group>
          </Canvas>
          <span className="wardrobe__balance coin-frame coin-frame--static" aria-label={`Your coins: ${balance}`}>
            <span className="coin-frame__amount">{compactCoins(balance)}</span>
          </span>
        </div>

        {!sideTabs && tabs}

        <div className="wardrobe__items" ref={itemsRef}>
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

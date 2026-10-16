import { CanvasTexture, SRGBColorSpace } from "three";
import { POWER_UPS, isPowerUpKind } from "@mini-sumo/shared";

/**
 * Nobori banner art for a power-up (vertical shop flag, as in the reference): a pastel field
 * with a dotted pattern and the power-up's round emblem, drawn on a canvas once and cached.
 */
const cache = new Map<string, CanvasTexture>();

const KANJI_FONT = `"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif CJK JP", "Noto Sans CJK JP", "Yu Gothic", "MS Gothic", serif`;

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + (amount > 0 ? (255 - v) * amount : v * amount))));
  return `rgb(${ch((n >> 16) & 255)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
}

export function bannerTexture(kind: string): CanvasTexture | null {
  if (!isPowerUpKind(kind)) return null;
  const cached = cache.get(kind);
  if (cached) return cached;
  const { kanji, color } = POWER_UPS[kind];
  const W = 160;
  const H = 440;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d")!;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;

  // Field
  g.fillStyle = shade(color, 0.62);
  g.fillRect(0, 0, W, H);
  // Dotted pattern
  g.fillStyle = shade(color, 0.85);
  for (let y = 14; y < H; y += 22) for (let x = (y / 22) % 2 ? 12 : 23; x < W; x += 22) g.fillRect(x, y, 3, 3);
  // Top band and side stripe, like shop nobori
  g.fillStyle = color;
  g.fillRect(0, 0, W, 34);
  g.fillRect(0, H - 22, W, 22);
  g.fillStyle = shade(color, -0.25);
  g.fillRect(W - 14, 34, 6, H - 56);
  // The round power-up emblem (public/powerups/<kind>-coin.webp), drawn when loaded.
  const emblem = new Image();
  const drawEmblem = () => {
    const size = W * 0.86;
    const ratio = emblem.naturalHeight / Math.max(1, emblem.naturalWidth);
    g.drawImage(emblem, (W - size) / 2 - 4, H * 0.44 - (size * ratio) / 2, size, size * ratio);
    texture.needsUpdate = true;
  };
  emblem.onload = drawEmblem;
  emblem.src = `${import.meta.env.BASE_URL}powerups/${kind}-coin.webp`;
  // Until it loads (or if it can't), the kanji.
  g.fillStyle = shade(color, -0.55);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `900 112px ${KANJI_FONT}`;
  g.fillText(kanji, W / 2 - 4, H * 0.44);
  // Outline
  g.lineWidth = 6;
  g.strokeStyle = shade(color, -0.6);
  g.strokeRect(3, 3, W - 6, H - 6);

  cache.set(kind, texture);
  return texture;
}

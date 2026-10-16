import { CanvasTexture, SRGBColorSpace } from "three";
import { POWER_UPS, isPowerUpKind } from "@mini-sumo/shared";

/**
 * Nobori banner art for a power-up (vertical shop flag, as in the reference): a pastel field
 * with a dotted pattern, a rope border and the power-up's kanji, drawn on a canvas once and
 * cached.
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
  // Kanji
  g.fillStyle = shade(color, -0.55);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `900 112px ${KANJI_FONT}`;
  g.fillText(kanji, W / 2 - 4, H * 0.42);
  // A small seal circle under it
  g.beginPath();
  g.arc(W / 2 - 4, H * 0.74, 30, 0, Math.PI * 2);
  g.fillStyle = "#ffffff";
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = color;
  g.stroke();
  g.fillStyle = color;
  g.font = `900 34px ${KANJI_FONT}`;
  g.fillText(kanji, W / 2 - 4, H * 0.74 + 1);
  // Outline
  g.lineWidth = 6;
  g.strokeStyle = shade(color, -0.6);
  g.strokeRect(3, 3, W - 6, H - 6);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  cache.set(kind, texture);
  return texture;
}

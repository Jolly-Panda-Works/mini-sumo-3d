import { CanvasTexture, SRGBColorSpace } from "three";

const FONT = '700 34px "Baloo 2", ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif';

/** Draws a pill-shaped label ("P1 Kenta") into a canvas texture. */
export function drawNameTag(canvas: HTMLCanvasElement, slot: number, name: string, color: string, isYou: boolean): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.font = FONT;
  const label = isYou ? `P${slot} You` : `P${slot} ${name}`;
  const textWidth = Math.min(ctx.measureText(label).width, w - 40);
  const pillW = textWidth + 36;
  const x = (w - pillW) / 2;
  const y = 8;
  const pillH = h - 16;
  const r = pillH / 2;

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + pillW, y, x + pillW, y + pillH, r);
  ctx.arcTo(x + pillW, y + pillH, x, y + pillH, r);
  ctx.arcTo(x, y + pillH, x, y, r);
  ctx.arcTo(x, y, x + pillW, y, r);
  ctx.closePath();
  ctx.fillStyle = isYou ? "#FFFFFF" : "rgba(43, 35, 64, 0.82)";
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = color;
  ctx.stroke();

  ctx.fillStyle = isYou ? "#2B2340" : "#FFFFFF";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, w / 2, h / 2 + 2, w - 40);
}

export function createNameTagTexture(slot: number, name: string, color: string, isYou: boolean): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 72;
  drawNameTag(canvas, slot, name, color, isYou);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  // Redraw once web fonts are ready so the label uses the game font.
  document.fonts?.ready.then(() => {
    drawNameTag(canvas, slot, name, color, isYou);
    texture.needsUpdate = true;
  });
  return texture;
}

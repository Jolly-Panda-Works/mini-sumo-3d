/**
 * Look and mood of each arena (client-only, cosmetic). Used by the 3D scene, the home
 * cards and the README art (tools/arena-art.ts).
 */
export interface ArenaTheme {
  id: string;
  title: string;
  mood: string;
  /** Scene */
  sky: string;
  skyTop: string;
  floor: string;
  floorRing: string;
  platform: string;
  surface: string;
  ring: string;
  rope: string;
  light: string;
  lightIntensity: number;
  hemiSky: string;
  hemiGround: string;
  tassels: [string, string, string, string];
  cushions: string[];
  /** Glowing lanterns around the ring (0 = none). */
  lanterns: number;
  lanternColor: string;
  /** Gold trim ring on the platform edge. */
  trim: string | null;
  /** Card */
  accent: string;
  ink: string;
}

export const ARENA_THEMES: Record<string, ArenaTheme> = {
  training: {
    id: "training",
    title: "Training Dojo",
    mood: "Morning light in a bamboo garden",
    sky: "#9ED3C6",
    skyTop: "#DFF4EC",
    floor: "#5E9E6E",
    floorRing: "#76B482",
    platform: "#C9A06A",
    surface: "#EAD9B4",
    ring: "#F2E4C4",
    rope: "#B9A15C",
    light: "#FFF6E0",
    lightIntensity: 1.6,
    hemiSky: "#F4FFF8",
    hemiGround: "#4E7A58",
    tassels: ["#3FA34D", "#E2443A", "#F4F1F8", "#2B2340"],
    cushions: ["#6FAF7A", "#E8C26A", "#8FC1D9", "#D9905F"],
    lanterns: 0,
    lanternColor: "#FFFFFF",
    trim: null,
    accent: "#3FA34D",
    ink: "#1F3B2A",
  },
  rookie: {
    id: "rookie",
    title: "Festival Street",
    mood: "Paper lanterns at a summer matsuri",
    sky: "#F08A5D",
    skyTop: "#FFD3A5",
    floor: "#7A3B4F",
    floorRing: "#934A60",
    platform: "#C47A45",
    surface: "#EBC48F",
    ring: "#F3D7A6",
    rope: "#D8B45E",
    light: "#FFD9A8",
    lightIntensity: 1.5,
    hemiSky: "#FFE6CC",
    hemiGround: "#6A2E40",
    tassels: ["#E2443A", "#F2C14E", "#E2443A", "#F2C14E"],
    cushions: ["#E2443A", "#F2C14E", "#F7F1E3", "#B83B5E"],
    lanterns: 10,
    lanternColor: "#FF5A3C",
    trim: null,
    accent: "#E2443A",
    ink: "#4A1626",
  },
  pro: {
    id: "pro",
    title: "Moonlit Temple",
    mood: "A quiet temple yard under the full moon",
    sky: "#253A73",
    skyTop: "#5B6FB8",
    floor: "#1C2650",
    floorRing: "#2C3A70",
    platform: "#7A6A8E",
    surface: "#C9C3DA",
    ring: "#DCD8EA",
    rope: "#A9B4E0",
    light: "#CFE0FF",
    lightIntensity: 1.25,
    hemiSky: "#B9C8FF",
    hemiGround: "#141B3A",
    tassels: ["#6BD3F2", "#9B7BF0", "#6BD3F2", "#9B7BF0"],
    cushions: ["#3C4C8F", "#6BD3F2", "#9B7BF0", "#2B3366"],
    lanterns: 12,
    lanternColor: "#7FE3FF",
    trim: null,
    accent: "#6BD3F2",
    ink: "#0F1636",
  },
  champion: {
    id: "champion",
    title: "Golden Palace",
    mood: "Crimson halls and a ring of gold",
    sky: "#5A1424",
    skyTop: "#A3283C",
    floor: "#3A0D18",
    floorRing: "#5A1424",
    platform: "#8E2A2A",
    surface: "#F0D9A0",
    ring: "#F7E7BC",
    rope: "#F2C14E",
    light: "#FFE4A8",
    lightIntensity: 1.7,
    hemiSky: "#FFE0C0",
    hemiGround: "#3A0D18",
    tassels: ["#F2C14E", "#F2C14E", "#F2C14E", "#F2C14E"],
    cushions: ["#F2C14E", "#B3123A", "#F7E7BC", "#7A0F2A"],
    lanterns: 8,
    lanternColor: "#FFC94A",
    trim: "#F2C14E",
    accent: "#F2C14E",
    ink: "#3A0D18",
  },
};

export function themeFor(arenaId: string | undefined | null): ArenaTheme {
  return (arenaId && ARENA_THEMES[arenaId]) || ARENA_THEMES.training!;
}

/** Illustrated arena card art as an SVG string (no text, so it works in any language). */
export function arenaArtSvg(arenaId: string, outWidth = 320, outHeight = 180): string {
  // Drawn on a fixed 320x180 canvas and scaled by the viewBox.
  const width = 320;
  const height = 180;
  const t = themeFor(arenaId);
  const front: string[] = [];
  const cx = width / 2;
  const ringY = height * 0.72;
  const deco: string[] = [];

  if (t.id === "training") {
    deco.push(`<circle cx="${width * 0.8}" cy="${height * 0.24}" r="18" fill="#FFF3B0"/>`);
    deco.push(`<path d="M0 ${ringY - 4} L60 70 L110 ${ringY - 4} Z" fill="#7FBFA0"/>`);
    deco.push(`<path d="M80 ${ringY - 4} L150 52 L230 ${ringY - 4} Z" fill="#6AAE8E"/>`);
    deco.push(`<path d="M190 ${ringY - 4} L260 78 L320 ${ringY - 4} Z" fill="#7FBFA0"/>`);
    for (const [x, h] of [
      [10, 150],
      [26, 120],
      [width - 22, 140],
      [width - 40, 112],
    ] as const) {
      front.push(`<rect x="${x}" y="${height - h}" width="7" height="${h}" rx="3" fill="#3E8E52"/>`);
      for (let y = height - h + 18; y < height; y += 24) front.push(`<rect x="${x - 1}" y="${y}" width="9" height="3" fill="#2E6E3E"/>`);
      front.push(`<path d="M${x + 4} ${height - h + 10} q 18 -10 26 4 q -16 0 -26 -4z" fill="#4FA862"/>`);
      front.push(`<path d="M${x + 3} ${height - h + 34} q -18 -8 -24 6 q 14 0 24 -6z" fill="#4FA862"/>`);
    }
  } else if (t.id === "rookie") {
    deco.push(`<path d="M0 34 Q ${cx} 64 ${width} 34" stroke="#4A1626" stroke-width="2" fill="none"/>`);
    for (let i = 1; i < 8; i++) {
      const x = (width / 8) * i;
      const y = 34 + Math.sin((i / 8) * Math.PI) * 26;
      deco.push(`<rect x="${x - 9}" y="${y}" width="18" height="24" rx="8" fill="${i % 2 ? "#FF5A3C" : "#F2C14E"}" stroke="#4A1626" stroke-width="2"/>`);
    }
    deco.push(`<rect x="0" y="${height * 0.5}" width="${width}" height="8" fill="#B83B5E" opacity="0.5"/>`);
  } else if (t.id === "pro") {
    deco.push(`<circle cx="${width * 0.78}" cy="${height * 0.26}" r="24" fill="#F4F1FF"/>`);
    deco.push(`<circle cx="${width * 0.78 + 8}" cy="${height * 0.26 - 4}" r="20" fill="${t.skyTop}" opacity="0.25"/>`);
    for (const [x, y] of [
      [30, 20],
      [70, 44],
      [120, 18],
      [180, 36],
      [210, 12],
      [290, 60],
    ] as const) {
      deco.push(`<circle cx="${(x / 320) * width}" cy="${y}" r="1.8" fill="#FFFFFF"/>`);
    }
    // torii gate
    const gx = width * 0.2;
    deco.push(`<rect x="${gx - 34}" y="62" width="68" height="7" rx="3" fill="#E2443A"/>`);
    deco.push(`<rect x="${gx - 28}" y="74" width="56" height="5" fill="#E2443A"/>`);
    deco.push(`<rect x="${gx - 24}" y="66" width="6" height="${ringY - 66}" fill="#E2443A"/>`);
    deco.push(`<rect x="${gx + 18}" y="66" width="6" height="${ringY - 66}" fill="#E2443A"/>`);
  } else {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI;
      deco.push(
        `<path d="M${cx} ${ringY - 20} L ${cx + Math.cos(a) * width} ${ringY - 20 - Math.sin(a) * height}" stroke="#F2C14E" stroke-width="10" opacity="0.18"/>`,
      );
    }
    deco.push(`<path d="M${cx - 26} 46 l 8 -18 l 10 12 l 8 -16 l 8 16 l 10 -12 l 8 18 z" fill="#F2C14E" stroke="#3A0D18" stroke-width="2"/>`);
    deco.push(`<rect x="12" y="20" width="16" height="${height * 0.55}" fill="#B3123A"/><rect x="${width - 28}" y="20" width="16" height="${height * 0.55}" fill="#B3123A"/>`);
  }

  const lanterns: string[] = [];
  if (t.lanterns > 0) {
    for (let i = 0; i < 6; i++) {
      const x = width * (0.12 + (i / 5) * 0.76);
      lanterns.push(`<circle cx="${x}" cy="${ringY - 46 + Math.abs(i - 2.5) * 6}" r="5" fill="${t.lanternColor}" opacity="0.9"/>`);
    }
  }

  const sumo = (x: number, color: string, flip: number) => `
    <g transform="translate(${x} ${ringY - 18}) scale(${flip} 1)">
      <ellipse cx="0" cy="12" rx="17" ry="4" fill="#000" opacity="0.18"/>
      <ellipse cx="0" cy="-2" rx="15" ry="13" fill="#FFD3B0" stroke="${t.ink}" stroke-width="2"/>
      <rect x="-15" y="2" width="30" height="6" rx="3" fill="${color}" stroke="${t.ink}" stroke-width="1.5"/>
      <circle cx="0" cy="-20" r="10" fill="#FFD3B0" stroke="${t.ink}" stroke-width="2"/>
      <circle cx="-1" cy="-31" r="3.5" fill="${t.ink}"/>
      <circle cx="4" cy="-21" r="1.4" fill="${t.ink}"/>
      <rect x="10" y="-6" width="12" height="6" rx="3" fill="#FFD3B0" stroke="${t.ink}" stroke-width="1.5"/>
    </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${outWidth}" height="${outHeight}">
  <defs>
    <linearGradient id="sky-${t.id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${t.skyTop}"/>
      <stop offset="1" stop-color="${t.sky}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#sky-${t.id})"/>
  ${deco.join("\n  ")}
  <rect x="0" y="${ringY - 4}" width="${width}" height="${height - ringY + 4}" fill="${t.floor}"/>
  ${lanterns.join("\n  ")}
  <ellipse cx="${cx}" cy="${ringY + 10}" rx="${width * 0.42}" ry="${height * 0.14}" fill="${t.platform}"/>
  <ellipse cx="${cx}" cy="${ringY}" rx="${width * 0.4}" ry="${height * 0.12}" fill="${t.surface}"/>
  <ellipse cx="${cx}" cy="${ringY}" rx="${width * 0.33}" ry="${height * 0.095}" fill="none" stroke="${t.rope}" stroke-width="5"/>
  ${t.trim ? `<ellipse cx="${cx}" cy="${ringY + 10}" rx="${width * 0.42}" ry="${height * 0.14}" fill="none" stroke="${t.trim}" stroke-width="3"/>` : ""}
  ${sumo(cx - 26, "#FF5D73", 1)}
  ${sumo(cx + 26, "#2EC4B6", -1)}
  ${front.join("\n  ")}
</svg>`;
}

export function arenaArtDataUri(arenaId: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(arenaArtSvg(arenaId))}`;
}

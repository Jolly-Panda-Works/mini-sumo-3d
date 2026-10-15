/**
 * Look and mood of each arena (client-only, cosmetic). The 3D scene colours follow the
 * arena artwork in apps/client/public/arenas/.
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
    title: "Training Grounds",
    mood: "Straw dummies, sandbags and a strict old coach",
    sky: "#BFE6F2",
    skyTop: "#E8F7FC",
    floor: "#6FAE4F",
    floorRing: "#82BF5E",
    platform: "#8B6A45",
    surface: "#C7A779",
    ring: "#D6B98A",
    rope: "#C8A64B",
    light: "#FFF6E0",
    lightIntensity: 1.6,
    hemiSky: "#F4FFF8",
    hemiGround: "#4E7A3A",
    tassels: ["#3E8E41", "#8B6A45", "#D9C27A", "#3E8E41"],
    cushions: ["#B89A6A", "#8B6A45", "#C8A64B", "#9FB27A"],
    lanterns: 0,
    lanternColor: "#FFFFFF",
    trim: null,
    accent: "#3E8E41",
    ink: "#1F3B1F",
  },
  rookie: {
    id: "rookie",
    title: "Park Festival",
    mood: "Bunting, cheering kids and fresh green hills",
    sky: "#9FDDF5",
    skyTop: "#DDF5FD",
    floor: "#78C04F",
    floorRing: "#8DCF62",
    platform: "#9A6A42",
    surface: "#D9B886",
    ring: "#E3C996",
    rope: "#E0B43A",
    light: "#FFF3D6",
    lightIntensity: 1.65,
    hemiSky: "#F2FBFF",
    hemiGround: "#4F8A33",
    tassels: ["#3D8BE0", "#F0566E", "#F7D046", "#F28C38"],
    cushions: ["#3D8BE0", "#F0566E", "#F7D046", "#F28C38"],
    lanterns: 10,
    lanternColor: "#F7D046",
    trim: null,
    accent: "#5DBB3F",
    ink: "#1E3B12",
  },
  pro: {
    id: "pro",
    title: "Night Stadium",
    mood: "Stadium lights, banners and a roaring crowd",
    sky: "#22305A",
    skyTop: "#3A4C85",
    floor: "#1C2747",
    floorRing: "#2A3A66",
    platform: "#A0683C",
    surface: "#EBD3A2",
    ring: "#F2DDB0",
    rope: "#F2C14E",
    light: "#E6EEFF",
    lightIntensity: 1.5,
    hemiSky: "#C9D6FF",
    hemiGround: "#141B3A",
    tassels: ["#E2443A", "#F7C928", "#E2443A", "#F7C928"],
    cushions: ["#3A4C85", "#2A3A66", "#4F63A3", "#2A3A66"],
    lanterns: 12,
    lanternColor: "#BFD0FF",
    trim: null,
    accent: "#F59E0B",
    ink: "#1B2240",
  },
  champion: {
    id: "champion",
    title: "Grand Final",
    mood: "Gold trophy, confetti and the champion's ring",
    sky: "#1A2246",
    skyTop: "#2E3B70",
    floor: "#151C3A",
    floorRing: "#B3123A",
    platform: "#A8743E",
    surface: "#F0DCA8",
    ring: "#F7E7BC",
    rope: "#F2C14E",
    light: "#FFE9B8",
    lightIntensity: 1.75,
    hemiSky: "#FFE6C8",
    hemiGround: "#151C3A",
    tassels: ["#F2C14E", "#E2443A", "#F2C14E", "#E2443A"],
    cushions: ["#E2443A", "#F2C14E", "#B3123A", "#F2C14E"],
    lanterns: 8,
    lanternColor: "#FFD54A",
    trim: "#F2C14E",
    accent: "#F2C14E",
    ink: "#1A2246",
  },
};

export function themeFor(arenaId: string | undefined | null): ArenaTheme {
  return (arenaId && ARENA_THEMES[arenaId]) || ARENA_THEMES.training!;
}

/** Card art (apps/client/public/arenas/<id>.webp). */
export function arenaImage(arenaId: string): string {
  return `${import.meta.env.BASE_URL}arenas/${themeFor(arenaId).id}.webp`;
}

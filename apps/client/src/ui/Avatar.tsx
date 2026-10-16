import { AVATARS } from "@mini-sumo/shared";

export const avatarSrc = (index: number) => `${import.meta.env.BASE_URL}avatars/${Math.max(0, Math.min(AVATARS.length - 1, index | 0))}.webp`;

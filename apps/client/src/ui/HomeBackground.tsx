/**
 * Home-screen backdrop: the seigaiha / fan / dohyō pattern tile (public/ui/bg-tile.webp)
 * repeated across the screen, with a soft light in the middle.
 * Match environments (the 3D arenas) are only shown once you are in a room.
 */
export function HomeBackground() {
  return <div className="home-bg" aria-hidden="true" />;
}

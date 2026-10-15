/**
 * Home-screen backdrop (CSS and inline SVG only): a night stage in the colours of the title
 * artwork, with two spotlights, twinkling stars and a band of seigaiha waves at the bottom.
 * Match environments (the 3D arenas) are only shown once you are in a room.
 */
const STARS = [
  [8, 18, 1],
  [16, 62, 0.7],
  [27, 30, 0.8],
  [38, 12, 0.6],
  [62, 16, 0.9],
  [71, 40, 0.6],
  [83, 22, 1],
  [92, 58, 0.7],
  [55, 52, 0.5],
  [6, 44, 0.6],
] as const;

const WAVES = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40" viewBox="0 0 80 40">
    <g fill="none" stroke="#ffffff" stroke-opacity="0.09" stroke-width="2.5">
      <circle cx="40" cy="40" r="36"/><circle cx="40" cy="40" r="26"/><circle cx="40" cy="40" r="16"/><circle cx="40" cy="40" r="6"/>
      <circle cx="0" cy="40" r="36"/><circle cx="0" cy="40" r="26"/><circle cx="0" cy="40" r="16"/>
      <circle cx="80" cy="40" r="36"/><circle cx="80" cy="40" r="26"/><circle cx="80" cy="40" r="16"/>
      <circle cx="20" cy="20" r="16" stroke-opacity="0.06"/><circle cx="60" cy="20" r="16" stroke-opacity="0.06"/>
    </g>
  </svg>`,
);

export function HomeBackground() {
  return (
    <div className="home-bg" aria-hidden="true">
      <div className="home-bg__beam home-bg__beam--left" />
      <div className="home-bg__beam home-bg__beam--right" />
      {STARS.map(([x, y, scale], i) => (
        <span
          key={i}
          className="home-bg__star"
          style={{ left: `${x}%`, top: `${y}%`, transform: `scale(${scale})`, animationDelay: `${(i * 0.37) % 2.4}s` }}
        />
      ))}
      <div className="home-bg__waves" style={{ backgroundImage: `url("data:image/svg+xml,${WAVES}")` }} />
    </div>
  );
}

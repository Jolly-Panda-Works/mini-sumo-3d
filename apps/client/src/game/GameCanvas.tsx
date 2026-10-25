import { Canvas } from "@react-three/fiber";
import { useStore } from "../store";
import { gameStore, sessionStore } from "../network/RoomManager";
import { Arena } from "./Arena";
import { CameraRig } from "./CameraRig";
import { Callouts } from "./Callouts";
import { Effects } from "./Effects";
import { MenuSumos } from "./MenuSumos";
import { NetSumo } from "./NetSumo";
import { ItemFlag } from "./PowerUpFlags";
import { themeFor } from "./arenaThemes";
import { uiStore } from "../uiStore";

export function GameCanvas() {
  const session = useStore(sessionStore);
  const game = useStore(gameStore);
  const ui = useStore(uiStore);
  const inRoom = session.status === "connected" && session.roomId !== "";
  // Each arena has its own look; the home screen previews the arena card in focus.
  const theme = themeFor(inRoom ? game.arenaId : ui.homeArena);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 40, near: 0.1, far: 200, position: [0, 15, 12] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      aria-label="Mini Sumo arena"
    >
      <color attach="background" args={[theme.sky]} />
      <fog attach="fog" args={[theme.sky, 32, 70]} />
      <hemisphereLight args={[theme.hemiSky, theme.hemiGround, 1.1]} />
      <directionalLight
        castShadow
        position={[7, 16, 9]}
        color={theme.light}
        intensity={theme.lightIntensity}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-13}
        shadow-camera-right={13}
        shadow-camera-top={13}
        shadow-camera-bottom={-13}
        shadow-camera-near={1}
        shadow-camera-far={45}
        shadow-bias={-0.0005}
      />
      <Arena theme={theme} />
      {inRoom
        ? game.players.map((p) => (
            <NetSumo
              key={p.id}
              id={p.id}
              name={p.name}
              colorIndex={p.colorIndex}
              isYou={p.isYou}
              hair={p.appearance.hair}
              hairColor={p.appearance.hairColor}
              face={p.appearance.face}
              outfit={p.appearance.outfit}
            />
          ))
        : <MenuSumos />}
      <ItemFlag />
      <Effects />
      {inRoom && <Callouts />}
      <CameraRig orbit={!inRoom} />
    </Canvas>
  );
}

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Object3D, type InstancedMesh, type Mesh, type MeshBasicMaterial } from "three";
import { dustBus, impactBus, pulseBus, timeScale } from "./effectsBus";

const DUST_COUNT = 160;
const SPARK_COUNT = 90;
const RING_COUNT = 6;
const PULSE_COUNT = 6;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
}

/** Pooled dust particles and impact shockwave rings (cosmetic only). */
export function Effects() {
  const dustRef = useRef<InstancedMesh>(null);
  const sparkRef = useRef<InstancedMesh>(null);
  const sparks = useMemo<Particle[]>(
    () => Array.from({ length: SPARK_COUNT }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 0.1 })),
    [],
  );
  const sparkCursor = useRef(0);
  const ringRefs = useRef<(Mesh | null)[]>([]);
  const dummy = useMemo(() => new Object3D(), []);
  const particles = useMemo<Particle[]>(
    () => Array.from({ length: DUST_COUNT }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 0.1 })),
    [],
  );
  const rings = useMemo(() => Array.from({ length: RING_COUNT }, () => ({ life: 0, strength: 0 })), []);
  const cursor = useRef({ dust: 0, ring: 0, pulse: 0 });
  const pulseRefs = useRef<(Mesh | null)[]>([]);
  const pulses = useMemo(() => Array.from({ length: PULSE_COUNT }, () => ({ life: 0, size: 1 })), []);

  useEffect(() => {
    const offDust = dustBus.on(({ x, y, count, speed }) => {
      for (let i = 0; i < count; i++) {
        const p = particles[cursor.current.dust]!;
        cursor.current.dust = (cursor.current.dust + 1) % DUST_COUNT;
        const a = Math.random() * Math.PI * 2;
        const s = (0.6 + Math.random()) * speed;
        p.x = x + Math.cos(a) * 0.4;
        p.z = y + Math.sin(a) * 0.4;
        p.y = 0.1;
        p.vx = Math.cos(a) * s;
        p.vz = Math.sin(a) * s;
        p.vy = 1 + Math.random() * 1.5;
        p.maxLife = 0.5 + Math.random() * 0.4;
        p.life = p.maxLife;
        p.size = 0.08 + Math.random() * 0.12;
      }
    });
    const offImpact = impactBus.on(({ x, y, strength }) => {
      const index = cursor.current.ring;
      cursor.current.ring = (cursor.current.ring + 1) % RING_COUNT;
      const ring = rings[index]!;
      ring.life = 1;
      ring.strength = Math.min(1, strength / 12);
      const mesh = ringRefs.current[index];
      if (mesh) mesh.position.set(x, 0.06, y);
      // Sparks fly out of the bump, more for harder hits.
      const n = Math.round(6 + Math.min(1, strength / 12) * 12);
      for (let i = 0; i < n; i++) {
        const sp = sparks[sparkCursor.current]!;
        sparkCursor.current = (sparkCursor.current + 1) % SPARK_COUNT;
        const a = Math.random() * Math.PI * 2;
        const out = 2.5 + Math.random() * 3.5;
        sp.x = x;
        sp.y = 0.8 + Math.random() * 0.4;
        sp.z = y;
        sp.vx = Math.cos(a) * out;
        sp.vz = Math.sin(a) * out;
        sp.vy = 2 + Math.random() * 3;
        sp.maxLife = 0.35 + Math.random() * 0.3;
        sp.life = sp.maxLife;
        sp.size = 0.05 + Math.random() * 0.07;
      }
    });
    // A coloured ring spreading over the floor (dash ready, a counter).
    const offPulse = pulseBus.on(({ x, y, color, size }) => {
      const index = cursor.current.pulse;
      cursor.current.pulse = (cursor.current.pulse + 1) % PULSE_COUNT;
      const pulse = pulses[index]!;
      pulse.life = 1;
      pulse.size = size;
      const mesh = pulseRefs.current[index];
      if (mesh) {
        mesh.position.set(x, 0.07, y);
        (mesh.material as MeshBasicMaterial).color.set(color);
      }
    });
    return () => {
      offDust();
      offImpact();
      offPulse();
    };
  }, [particles, rings, sparks, pulses]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1) * timeScale();
    const mesh = dustRef.current;
    if (mesh) {
      for (let i = 0; i < DUST_COUNT; i++) {
        const p = particles[i]!;
        if (p.life > 0) {
          p.life -= dt;
          p.vy -= 6 * dt;
          p.x += p.vx * dt;
          p.y = Math.max(0.03, p.y + p.vy * dt);
          p.z += p.vz * dt;
          p.vx *= 0.94;
          p.vz *= 0.94;
          const k = Math.max(0, p.life / p.maxLife);
          dummy.position.set(p.x, p.y, p.z);
          dummy.scale.setScalar(p.size * (0.4 + k));
        } else {
          dummy.position.set(0, -50, 0);
          dummy.scale.setScalar(0.0001);
        }
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    const sparkMesh = sparkRef.current;
    if (sparkMesh) {
      for (let i = 0; i < SPARK_COUNT; i++) {
        const p = sparks[i]!;
        if (p.life > 0) {
          p.life -= dt;
          p.vy -= 12 * dt;
          p.x += p.vx * dt;
          p.y = Math.max(0.05, p.y + p.vy * dt);
          p.z += p.vz * dt;
          p.vx *= 0.9;
          p.vz *= 0.9;
          const k = Math.max(0, p.life / p.maxLife);
          dummy.position.set(p.x, p.y, p.z);
          dummy.rotation.set(p.life * 9, p.life * 7, 0);
          dummy.scale.setScalar(p.size * (0.3 + k));
        } else {
          dummy.position.set(0, -50, 0);
          dummy.scale.setScalar(0.0001);
        }
        dummy.updateMatrix();
        sparkMesh.setMatrixAt(i, dummy.matrix);
      }
      sparkMesh.instanceMatrix.needsUpdate = true;
      dummy.rotation.set(0, 0, 0);
    }

    for (let i = 0; i < RING_COUNT; i++) {
      const ring = rings[i]!;
      const ringMesh = ringRefs.current[i];
      if (!ringMesh) continue;
      if (ring.life > 0) {
        ring.life = Math.max(0, ring.life - dt * 2.8);
        const grow = 1 + (1 - ring.life) * (1.5 + ring.strength * 2.5);
        ringMesh.visible = true;
        ringMesh.scale.set(grow, grow, grow);
        (ringMesh.material as MeshBasicMaterial).opacity = ring.life * 0.85;
      } else {
        ringMesh.visible = false;
      }
    }

    for (let i = 0; i < PULSE_COUNT; i++) {
      const pulse = pulses[i]!;
      const pulseMesh = pulseRefs.current[i];
      if (!pulseMesh) continue;
      if (pulse.life > 0) {
        pulse.life = Math.max(0, pulse.life - dt * 2.2);
        const grow = pulse.size * (0.6 + (1 - pulse.life) * 1.4);
        pulseMesh.visible = true;
        pulseMesh.scale.set(grow, grow, grow);
        (pulseMesh.material as MeshBasicMaterial).opacity = pulse.life * 0.9;
      } else {
        pulseMesh.visible = false;
      }
    }
  });

  return (
    <>
      <instancedMesh ref={dustRef} args={[undefined, undefined, DUST_COUNT]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#F1DDB4" roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh ref={sparkRef} args={[undefined, undefined, SPARK_COUNT]} frustumCulled={false}>
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial color="#FFE08A" toneMapped={false} />
      </instancedMesh>
      {rings.map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            ringRefs.current[i] = el;
          }}
          rotation-x={-Math.PI / 2}
          visible={false}
          renderOrder={2}
        >
          <ringGeometry args={[0.55, 0.8, 32]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      {pulses.map((_, i) => (
        <mesh
          key={`pulse-${i}`}
          ref={(el) => {
            pulseRefs.current[i] = el;
          }}
          rotation-x={-Math.PI / 2}
          visible={false}
          renderOrder={2}
        >
          <ringGeometry args={[0.8, 0.95, 40]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

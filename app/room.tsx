'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import type { Group } from 'three';
import { roomPalettes, type RoomPalette } from '../lib/room-style';

type Position = [number, number, number];

function Block({ position, size, color }: { position: Position; size: Position; color: string }) {
  return <mesh position={position}><boxGeometry args={size} /><meshStandardMaterial color={color} /></mesh>;
}

type Destination = { x: number; z: number };

const avatarColors = { sage: '#668663', plum: '#946085', ocean: '#52758a' };
type AvatarColor = keyof typeof avatarColors;

function Avatar({ destination, color, reducedMotion }: {
  destination: Destination; color: string; reducedMotion: boolean;
}) {
  const avatar = useRef<Group>(null);
  const legs = useRef<Group>(null);
  const phase = useRef(0);

  useFrame(({ invalidate }, delta) => {
    const body = avatar.current;
    const feet = legs.current;
    if (!body || !feet) return;
    const dx = destination.x - body.position.x;
    const dz = destination.z - body.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 0.001) body.rotation.y = Math.atan2(dx, dz);
    const step = reducedMotion ? distance : Math.min(distance, Math.min(delta || 1 / 60, 0.05) * 2.6);
    if (distance > step) {
      body.position.x += (dx / distance) * step;
      body.position.z += (dz / distance) * step;
      phase.current += step * 11;
      feet.children[0].rotation.x = Math.sin(phase.current) * 0.48;
      feet.children[1].rotation.x = -feet.children[0].rotation.x;
      invalidate();
    } else {
      body.position.set(destination.x, 0, destination.z);
      feet.children[0].rotation.x = 0;
      feet.children[1].rotation.x = 0;
    }
  });

  return (
    <group ref={avatar}>
      <group ref={legs}>
        {[-0.09, 0.09].map((x) => <group key={x} position={[x, 0.19, 0]}>
          <Block position={[0, -0.07, 0]} size={[0.14, 0.17, 0.14]} color="#47405a" />
          <Block position={[0, -0.15, 0.02]} size={[0.15, 0.1, 0.19]} color="#473642" />
        </group>)}
      </group>
      <Block position={[0, 0.33, 0]} size={[0.34, 0.29, 0.24]} color={color} />
      <Block position={[-0.211, 0.32, 0]} size={[0.082, 0.22, 0.18]} color={color} />
      <Block position={[0.211, 0.32, 0]} size={[0.082, 0.22, 0.18]} color={color} />
      <Block position={[0, 0.57, 0.02]} size={[0.28, 0.28, 0.24]} color="#d9a075" />
      <Block position={[0, 0.72, 0]} size={[0.31, 0.09, 0.29]} color="#5b4439" />
      <Block position={[-0.065, 0.57, 0.148]} size={[0.035, 0.034, 0.014]} color="#4f3835" />
      <Block position={[0.065, 0.57, 0.148]} size={[0.035, 0.034, 0.014]} color="#4f3835" />
    </group>
  );
}

const movement = [
  { key: 'ArrowUp', symbol: '↑', label: 'Arriba', dx: 0, dz: -0.46 },
  { key: 'ArrowLeft', symbol: '←', label: 'Izquierda', dx: -0.46, dz: 0 },
  { key: 'ArrowDown', symbol: '↓', label: 'Abajo', dx: 0, dz: 0.46 },
  { key: 'ArrowRight', symbol: '→', label: 'Derecha', dx: 0.46, dz: 0 },
] as const;

function insideRoom(x: number, z: number): Destination {
  return { x: Math.max(-1.12, Math.min(2.42, x)), z: Math.max(-0.88, Math.min(2.07, z)) };
}

export default function Room({ completed, palette, userId, openTasks }: {
  completed: number; palette: RoomPalette; userId: string; openTasks: () => void;
}) {
  const colors = roomPalettes[palette];
  const avatarPreference = 'ourspace-avatar-color:' + userId;
  const [destination, setDestination] = useState<Destination>({ x: 0.36, z: 1.08 });
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [avatarColor, setAvatarColor] = useState<AvatarColor>(() => {
    try {
      const color = localStorage.getItem(avatarPreference);
      if (color === 'plum' || color === 'ocean') return color;
    } catch { /* Avatar stays usable when local storage is unavailable. */ }
    return 'sage';
  });

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  function move(dx: number, dz: number) {
    setDestination(({ x, z }) => insideRoom(x + dx, z + dz));
  }

  return (
    <div className="room" style={{ backgroundColor: colors.background }}>
      <div className="room-art" aria-hidden="true">
        <Canvas orthographic camera={{ position: [8, 7, 10], zoom: 47 }} dpr={0.55} gl={{ antialias: false }}
          frameloop="demand" fallback={<div className="room-fallback">La vista 3D requiere WebGL.</div>}>
          <color attach="background" args={[colors.background]} />
          <ambientLight intensity={1.45} />
          <directionalLight position={[4, 7, 3]} intensity={2.1} />
          <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}
            onClick={({ point, stopPropagation }) => {
              stopPropagation();
              setDestination(insideRoom(point.x, point.z));
            }}>
            <planeGeometry args={[6, 5]} /><meshBasicMaterial visible={false} />
          </mesh>
          <Avatar destination={destination} color={avatarColors[avatarColor]} reducedMotion={reducedMotion} />
          <Block position={[0, -0.2, 0]} size={[6, 0.4, 5]} color="#bb845f" />
          <Block position={[0, 1, -2.42]} size={[6, 2, 0.16]} color={colors.wall} />
          <Block position={[-2.92, 1, 0]} size={[0.16, 2, 4.7]} color={colors.side} />
          <Block position={[0.8, 0.02, 0.8]} size={[2.8, 0.04, 2.04]} color={colors.rug} />
          <Block position={[-1.8, 0.38, 0.55]} size={[0.95, 0.74, 2.08]} color="#63806e" />
          <Block position={[-2.2, 0.77, 0.55]} size={[0.25, 0.65, 2.08]} color="#789681" />
          <Block position={[-1.74, 0.72, 0.16]} size={[0.5, 0.23, 0.48]} color="#edd2a5" />
          {[0.1, 0.8, 1.5, 2.2].map((z) => (
            <Block key={z} position={[0, 0, z]} size={[5.94, 0.012, 0.025]} color="#9f674a" />
          ))}
          <Block position={[-0.75, 1.44, -2.31]} size={[1.46, 0.86, 0.11]} color="#714e41" />
          <Block position={[-0.75, 1.44, -2.24]} size={[1.18, 0.64, 0.05]} color="#e7b77a" />
          <Block position={[-0.75, 1.44, -2.2]} size={[0.058, 0.68, 0.035]} color="#a46c53" />
          <Block position={[-0.75, 1.44, -2.2]} size={[1.22, 0.058, 0.035]} color="#a46c53" />
          <Block position={[0.61, 0.02, 0.8]} size={[2.1, 0.05, 0.1]} color={colors.trim} />
          <Block position={[0.61, 0.02, 1.1]} size={[1.4, 0.05, 0.07]} color={colors.trim} />
          <group onClick={(event) => { event.stopPropagation(); openTasks(); }}
            onPointerOver={(event) => { (event.nativeEvent.target as HTMLElement).style.cursor = 'pointer'; }}
            onPointerOut={(event) => { (event.nativeEvent.target as HTMLElement).style.cursor = ''; }}>
            <Block position={[1.35, 0.97, -1.53]} size={[2.12, 0.16, 0.95]} color="#80513a" />
            <Block position={[0.5, 0.45, -1.53]} size={[0.16, 0.9, 0.72]} color="#684634" />
            <Block position={[2.2, 0.45, -1.53]} size={[0.16, 0.9, 0.72]} color="#684634" />
            <Block position={[1.35, 1.14, -1.45]} size={[0.61, 0.14, 0.42]} color={completed ? '#9bbd7a' : '#f4ddaf'} />
            <Block position={[1.96, 1.2, -1.78]} size={[0.16, 0.3, 0.16]} color="#bd7653" />
          </group>
          <Block position={[-2, 0.22, -1.66]} size={[0.5, 0.44, 0.5]} color="#b46b55" />
          <Block position={[-2, 0.63, -1.66]} size={[0.24, 0.48, 0.24]} color="#587e51" />
          <Block position={[-2.14, 0.85, -1.58]} size={[0.45, 0.16, 0.21]} color="#729761" />
        </Canvas>
      </div>
      <div className="room-controls">
        <div className="d-pad" role="group" aria-label="Mover avatar" onKeyDown={(event) => {
          const direction = movement.find(({ key }) => key === event.key);
          if (!direction) return;
          event.preventDefault();
          move(direction.dx, direction.dz);
        }}>
          {movement.map(({ key, symbol, label, dx, dz }) => (
            <button className="secondary" key={key} type="button" aria-label={label} onClick={() => move(dx, dz)}>{symbol}</button>
          ))}
        </div>
        <label className="avatar-color">Ropa
          <select value={avatarColor} onChange={(event) => {
            const color = event.currentTarget.value as AvatarColor;
            setAvatarColor(color);
            try { localStorage.setItem(avatarPreference, color); } catch { /* Optional preference. */ }
          }}>
            <option value="sage">Verde</option><option value="plum">Ciruela</option><option value="ocean">Azul</option>
          </select>
        </label>
        <button className="desk-button" onClick={openTasks}>Abrir tareas del escritorio</button>
      </div>
    </div>
  );
}

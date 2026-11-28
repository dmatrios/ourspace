'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import type { Group } from 'three';
import PixelSelect, { type PixelSelectOption } from './pixel-select';
import type { AvatarAppearance, AvatarHairColor, AvatarHairStyle, AvatarOutfit, MemberAvatar } from './avatar';
import { roomPalettes, type RoomPalette } from '../lib/room-style';

type Position = [number, number, number];

function Block({ position, size, color }: { position: Position; size: Position; color: string }) {
  return <mesh position={position}><boxGeometry args={size} /><meshStandardMaterial color={color} /></mesh>;
}

type Destination = { x: number; z: number };

const outfitColors: Record<AvatarOutfit, string> = {
  sage: '#668663', plum: '#946085', ocean: '#52758a', coral: '#c66f5e',
};
const hairColors: Record<AvatarHairColor, string> = { brown: '#5b4439', black: '#302d35', blonde: '#d2a85e' };
const silhouetteOptions: PixelSelectOption[] = [
  { value: 'neutral', label: 'Neutra' },
  { value: 'masculine', label: 'Masculina' },
  { value: 'feminine', label: 'Femenina' },
];
const hairStyleLabels: Record<AvatarHairStyle, string> = { short: 'Corto', long: 'Largo', curly: 'Rizado' };
const hairColorOptions: PixelSelectOption[] = [
  { value: 'brown', label: 'Castaño' },
  { value: 'black', label: 'Negro' },
  { value: 'blonde', label: 'Rubio' },
];
const outfitLabels: Record<AvatarOutfit, string> = { sage: 'Verde', plum: 'Ciruela', ocean: 'Azul', coral: 'Coral' };

function Hair({ style, color }: { style: AvatarHairStyle; color: string }) {
  return (
    <group>
      <Block position={[0, 0.72, 0]} size={[0.32, 0.09, 0.29]} color={color} />
      {style === 'short' && <Block position={[0, 0.65, -0.09]} size={[0.27, 0.13, 0.12]} color={color} />}
      {style === 'long' && <>
        <Block position={[-0.13, 0.53, -0.01]} size={[0.09, 0.32, 0.2]} color={color} />
        <Block position={[0.13, 0.53, -0.01]} size={[0.09, 0.32, 0.2]} color={color} />
        <Block position={[0, 0.42, -0.08]} size={[0.27, 0.11, 0.1]} color={color} />
      </>}
      {style === 'curly' && <>
        {[-0.1, 0, 0.1].map((x) => <Block key={x} position={[x, 0.79, 0]} size={[0.1, 0.1, 0.1]} color={color} />)}
        <Block position={[-0.14, 0.7, -0.02]} size={[0.1, 0.12, 0.15]} color={color} />
        <Block position={[0.14, 0.7, -0.02]} size={[0.1, 0.12, 0.15]} color={color} />
      </>}
    </group>
  );
}

function Avatar({ destination, appearance, reducedMotion }: {
  destination: Destination; appearance: AvatarAppearance; reducedMotion: boolean;
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
      <Block position={[0, 0.33, 0]} size={appearance.silhouette === 'masculine' ? [0.4, 0.3, 0.25] : appearance.silhouette === 'feminine' ? [0.32, 0.3, 0.24] : [0.35, 0.29, 0.24]} color={outfitColors[appearance.outfit]} />
      <Block position={[-0.211, 0.32, 0]} size={[0.082, 0.22, 0.18]} color={outfitColors[appearance.outfit]} />
      <Block position={[0.211, 0.32, 0]} size={[0.082, 0.22, 0.18]} color={outfitColors[appearance.outfit]} />
      <Block position={[0, 0.57, 0.02]} size={[0.28, 0.28, 0.24]} color="#d9a075" />
      <Hair style={appearance.hair_style} color={hairColors[appearance.hair_color]} />
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

export default function Room({ completed, palette, avatar, onAvatarChange, openTasks }: {
  completed: number; palette: RoomPalette; avatar: MemberAvatar;
  onAvatarChange: (appearance: AvatarAppearance) => Promise<void>; openTasks: () => void;
}) {
  const colors = roomPalettes[palette];
  const [destination, setDestination] = useState<Destination>({ x: 0.36, z: 1.08 });
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [savingAppearance, setSavingAppearance] = useState(false);
  const [appearanceMessage, setAppearanceMessage] = useState('');

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  function move(dx: number, dz: number) {
    setDestination(({ x, z }) => insideRoom(x + dx, z + dz));
  }

  async function changeAppearance(field: keyof AvatarAppearance, value: string) {
    if (savingAppearance) return;
    const next = { ...avatar.appearance, [field]: value } as AvatarAppearance;
    setSavingAppearance(true);
    setAppearanceMessage('');
    try {
      await onAvatarChange(next);
      setAppearanceMessage('Estilo guardado.');
    } catch {
      setAppearanceMessage('No se pudo guardar. Inténtalo de nuevo.');
    } finally {
      setSavingAppearance(false);
    }
  }

  const hairstyleOptions = avatar.progress.unlocked_hair_styles.map((style) => ({ value: style, label: hairStyleLabels[style] }));
  const outfitOptions = avatar.progress.unlocked_outfits.map((outfit) => ({ value: outfit, label: outfitLabels[outfit] }));

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
          <Avatar destination={destination} appearance={avatar.appearance} reducedMotion={reducedMotion} />
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
        <div className="room-control-row">
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
          <button className="desk-button" onClick={openTasks}>Abrir tareas del escritorio</button>
        </div>
        <section className="avatar-customization" aria-labelledby="avatar-customization-title">
          <h2 id="avatar-customization-title">Personaliza tu avatar</h2>
          <fieldset className="avatar-options" disabled={savingAppearance}>
            <PixelSelect label="Silueta" name="avatar-silhouette" value={avatar.appearance.silhouette}
              options={silhouetteOptions} onValueChange={(value) => void changeAppearance('silhouette', value)} />
            <PixelSelect label="Cabello" name="avatar-hair-style" value={avatar.appearance.hair_style}
              options={hairstyleOptions} onValueChange={(value) => void changeAppearance('hair_style', value)} />
            <PixelSelect label="Color de cabello" name="avatar-hair-color" value={avatar.appearance.hair_color}
              options={hairColorOptions} onValueChange={(value) => void changeAppearance('hair_color', value)} />
            <PixelSelect label="Ropa" name="avatar-outfit" value={avatar.appearance.outfit}
              options={outfitOptions} onValueChange={(value) => void changeAppearance('outfit', value)} />
          </fieldset>
          <p className="avatar-progress">{avatar.progress.completed_tasks} tareas completadas · {avatar.progress.active_days} días activos</p>
          <ul className="avatar-unlocks">
            <li aria-label={avatar.progress.completed_tasks >= 3 ? 'Desbloqueado' : 'Bloqueado'}>{avatar.progress.completed_tasks >= 3 ? '✓' : '🔒'} Cabello largo · 3 tareas completadas</li>
            <li aria-label={avatar.progress.active_days >= 7 ? 'Desbloqueado' : 'Bloqueado'}>{avatar.progress.active_days >= 7 ? '✓' : '🔒'} Cabello rizado · 7 días activos</li>
            <li aria-label={avatar.progress.active_days >= 3 ? 'Desbloqueado' : 'Bloqueado'}>{avatar.progress.active_days >= 3 ? '✓' : '🔒'} Ropa ciruela · 3 días activos</li>
            <li aria-label={avatar.progress.completed_tasks >= 5 ? 'Desbloqueado' : 'Bloqueado'}>{avatar.progress.completed_tasks >= 5 ? '✓' : '🔒'} Ropa azul · 5 tareas completadas</li>
            <li aria-label={avatar.progress.active_days >= 14 ? 'Desbloqueado' : 'Bloqueado'}>{avatar.progress.active_days >= 14 ? '✓' : '🔒'} Ropa coral · 14 días activos</li>
          </ul>
          {appearanceMessage && <p role="status">{appearanceMessage}</p>}
        </section>
      </div>
    </div>
  );
}

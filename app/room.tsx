'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Group } from 'three';
import PixelSelect, { type PixelSelectOption } from './pixel-select';
import type { AvatarAppearance, AvatarHairColor, AvatarHairStyle, AvatarOutfit, MemberAvatar } from './avatar';
import { connect } from '../lib/supabase';
import { roomPalettes, type RoomPalette } from '../lib/room-style';
import { FurnitureControls, FurnitureScene, gridPoint, useRoomFurniture } from './room-furniture';

type Position = [number, number, number];
type Client = NonNullable<ReturnType<typeof connect>>;
type Channel = ReturnType<Client['channel']>;

function Block({ position, size, color }: { position: Position; size: Position; color: string }) {
  return <mesh position={position}><boxGeometry args={size} /><meshStandardMaterial color={color} /></mesh>;
}

type Destination = { x: number; z: number };
type Partner = { userId: string; destination: Destination; appearance: AvatarAppearance };
const initialDestination: Destination = { x: 0.36, z: 1.08 };
const partnerStart: Destination = { x: -0.42, z: 1.08 };

function readDestination(value: unknown): Destination | null {
  if (!value || typeof value !== 'object') return null;
  const point = value as Record<string, unknown>;
  if (typeof point.x !== 'number' || typeof point.z !== 'number'
    || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  return insideRoom(point.x, point.z);
}

function readAppearance(value: unknown): AvatarAppearance | null {
  if (!value || typeof value !== 'object') return null;
  const appearance = value as Record<string, unknown>;
  if (!['neutral', 'masculine', 'feminine'].includes(String(appearance.silhouette))
    || !['short', 'long', 'curly'].includes(String(appearance.hair_style))
    || !['brown', 'black', 'blonde'].includes(String(appearance.hair_color))
    || !['sage', 'plum', 'ocean', 'coral', 'courier_red'].includes(String(appearance.outfit))) return null;
  return appearance as AvatarAppearance;
}

const outfitColors: Record<AvatarOutfit, string> = {
  sage: '#668663', plum: '#946085', ocean: '#52758a', coral: '#c66f5e', courier_red: '#e43e64',
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
const outfitLabels: Record<AvatarOutfit, string> = { sage: 'Verde', plum: 'Ciruela', ocean: 'Azul', coral: 'Coral', courier_red: 'Repartidor Peya' };

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
  const [startingPosition] = useState(destination);

  useLayoutEffect(() => {
    avatar.current?.position.set(startingPosition.x, 0, startingPosition.z);
  }, [startingPosition]);

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
      {appearance.outfit === 'courier_red' && <>
        <Block position={[0, 0.34, -0.19]} size={[0.44, 0.43, 0.26]} color="#b6234d" />
        <Block position={[0, 0.34, -0.33]} size={[0.29, 0.13, 0.025]} color="#fff0d0" />
        <Block position={[0, 0.49, 0.136]} size={[0.28, 0.045, 0.03]} color="#fff0d0" />
        <Block position={[0, 0.79, 0.035]} size={[0.38, 0.09, 0.35]} color="#e43e64" />
        <Block position={[0, 0.74, 0.24]} size={[0.28, 0.035, 0.15]} color="#b6234d" />
      </>}
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

export default function Room({ completed, palette, avatar, client, spaceId, userId, ownerId, paired, canEdit, onAvatarChange, openTasks }: {
  completed: number; palette: RoomPalette; avatar: MemberAvatar;
  client: Client; spaceId: string; userId: string; ownerId: string; paired: boolean; canEdit: boolean;
  onAvatarChange: (appearance: AvatarAppearance) => Promise<void>; openTasks: () => void;
}) {
  const colors = roomPalettes[palette];
  const furniture = useRoomFurniture(client, spaceId);
  const [destination, setDestination] = useState<Destination>(() => userId === ownerId ? initialDestination : partnerStart);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [liveStatus, setLiveStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const channelRef = useRef<Channel | null>(null);
  const partnerId = useRef<string | null>(null);
  const latestDestination = useRef(destination);
  const latestAppearance = useRef(avatar.appearance);
  const trackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [savingAppearance, setSavingAppearance] = useState(false);
  const [appearanceMessage, setAppearanceMessage] = useState('');

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!paired) return;
    let active = true;
    const channel = client.channel(`ourspace:room:${spaceId}`, {
      config: { private: true, presence: { key: userId, enabled: true }, broadcast: { self: false } },
    });
    const syncPartner = () => {
      if (!active) return;
      for (const [key, entries] of Object.entries(channel.presenceState())) {
        if (key === userId) continue;
        for (const entry of entries) {
          const data = entry as Record<string, unknown>;
          const position = readDestination(data.destination);
          const appearance = readAppearance(data.appearance);
          if (position && appearance) {
            partnerId.current = key;
            setPartner({ userId: key, destination: position, appearance });
            return;
          }
        }
      }
      partnerId.current = null;
      setPartner(null);
    };
    channel.on('presence', { event: 'sync' }, syncPartner);
    channel.on('broadcast', { event: 'move' }, ({ payload }) => {
      if (!active) return;
      if (payload.user_id !== partnerId.current) return;
      const position = readDestination(payload.destination);
      if (position) setPartner((current) => current ? { ...current, destination: position } : null);
    });
    channel.subscribe((status) => {
      if (!active) return;
      if (status === 'SUBSCRIBED') {
        channelRef.current = channel;
        void channel.track({ user_id: userId, destination: latestDestination.current,
          appearance: latestAppearance.current }).then((result) => {
            if (active) setLiveStatus(result === 'ok' ? 'connected' : 'error');
          }).catch(() => { if (active) setLiveStatus('error'); });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setLiveStatus('error');
        setPartner(null);
      }
    });
    return () => {
      active = false;
      channelRef.current = null;
      partnerId.current = null;
      if (trackTimer.current) clearTimeout(trackTimer.current);
      void client.removeChannel(channel);
    };
  }, [client, paired, spaceId, userId]);

  useEffect(() => {
    latestAppearance.current = avatar.appearance;
    if (channelRef.current) void channelRef.current.track({ user_id: userId,
      destination: latestDestination.current, appearance: avatar.appearance });
  }, [avatar.appearance, userId]);

  function goTo(position: Destination) {
    latestDestination.current = position;
    setDestination(position);
    const channel = channelRef.current;
    if (!channel) return;
    void channel.send({ type: 'broadcast', event: 'move', payload: { user_id: userId, destination: position } });
    if (trackTimer.current) clearTimeout(trackTimer.current);
    trackTimer.current = setTimeout(() => {
      void channel.track({ user_id: userId, destination: latestDestination.current,
        appearance: latestAppearance.current });
    }, 350);
  }

  function move(dx: number, dz: number) {
    const { x, z } = latestDestination.current;
    goTo(insideRoom(x + dx, z + dz));
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
              if (canEdit && furniture.place(gridPoint(point.x, point.z).x, gridPoint(point.x, point.z).z)) return;
              goTo(insideRoom(point.x, point.z));
            }}>
            <planeGeometry args={[6, 5]} /><meshBasicMaterial visible={false} />
          </mesh>
          <Avatar destination={destination} appearance={avatar.appearance} reducedMotion={reducedMotion} />
          {paired && partner && <Avatar key={partner.userId} destination={partner.destination}
            appearance={partner.appearance} reducedMotion={reducedMotion} />}
          <Block position={[0, -0.2, 0]} size={[6, 0.4, 5]} color="#bb845f" />
          <Block position={[0, 1, -2.42]} size={[6, 2, 0.16]} color={colors.wall} />
          <Block position={[-2.92, 1, 0]} size={[0.16, 2, 4.7]} color={colors.side} />
          <Block position={[0.8, 0.02, 0.8]} size={[2.8, 0.04, 2.04]} color={colors.rug} />
          {[0.1, 0.8, 1.5, 2.2].map((z) => (
            <Block key={z} position={[0, 0, z]} size={[5.94, 0.012, 0.025]} color="#9f674a" />
          ))}
          <Block position={[-0.75, 1.44, -2.31]} size={[1.46, 0.86, 0.11]} color="#714e41" />
          <Block position={[-0.75, 1.44, -2.24]} size={[1.18, 0.64, 0.05]} color="#e7b77a" />
          <Block position={[-0.75, 1.44, -2.2]} size={[0.058, 0.68, 0.035]} color="#a46c53" />
          <Block position={[-0.75, 1.44, -2.2]} size={[1.22, 0.058, 0.035]} color="#a46c53" />
          <Block position={[0.61, 0.02, 0.8]} size={[2.1, 0.05, 0.1]} color={colors.trim} />
          <Block position={[0.61, 0.02, 1.1]} size={[1.4, 0.05, 0.07]} color={completed > 0 ? '#9bbd7a' : colors.trim} />
          <FurnitureScene items={furniture.layout.items} editing={canEdit && furniture.editing}
            selectedId={furniture.selectedId} onSelect={furniture.setSelectedId} openTasks={openTasks} />
        </Canvas>
      </div>
      {paired && <p role="status" className="room-presence-status">{partner ? 'Tu pareja está en la casa contigo.'
        : liveStatus === 'error' ? 'No se pudo conectar la casa en vivo. Recarga la página para reintentar.'
          : liveStatus === 'connecting' ? 'Conectando la casa en vivo…' : 'Tu pareja no está en la casa ahora.'}</p>}
      <div className="room-controls">
        {canEdit && <FurnitureControls state={furniture} />}
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
          {avatar.progress.courier_enabled && <p className="avatar-progress">Skin de repartidor desbloqueada por tu rol de trabajo.</p>}
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

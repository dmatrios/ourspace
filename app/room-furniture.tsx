'use client';

import { useCallback, useEffect, useState } from 'react';
import { connect } from '../lib/supabase';

type Client = NonNullable<ReturnType<typeof connect>>;
type Position = [number, number, number];
export type FurnitureKind = 'sofa' | 'desk' | 'plant' | 'chair' | 'lamp' | 'bookshelf' | 'flowers';
export type RoomItem = { id: string; kind: FurnitureKind; x: number; z: number };
type RoomLayout = { items: RoomItem[]; unlocked_kinds: FurnitureKind[]; revision: number;
  progress: { completed_tasks: number; active_days: number } };

export const defaultRoomItems: RoomItem[] = [
  { id: 'sofa', kind: 'sofa', x: 1, z: 5 },
  { id: 'desk', kind: 'desk', x: 6, z: 1 },
  { id: 'plant', kind: 'plant', x: 0, z: 1 },
];

const catalog: { kind: FurnitureKind; name: string; unlock: string; limit: number }[] = [
  { kind: 'sofa', name: 'Sofá', unlock: 'Disponible', limit: 1 },
  { kind: 'desk', name: 'Escritorio', unlock: 'Disponible', limit: 1 },
  { kind: 'plant', name: 'Planta', unlock: 'Disponible', limit: 3 },
  { kind: 'chair', name: 'Silla', unlock: '2 tareas de la casa', limit: 3 },
  { kind: 'lamp', name: 'Lámpara', unlock: '5 tareas de la casa', limit: 1 },
  { kind: 'bookshelf', name: 'Estantería', unlock: '7 días activos', limit: 1 },
  { kind: 'flowers', name: 'Flores', unlock: '8 tareas o 14 días activos', limit: 3 },
];
export const furnitureName = (kind: FurnitureKind) => catalog.find((item) => item.kind === kind)?.name ?? kind;
const world = (item: RoomItem) => ({ x: -2.2 + item.x * .55, z: -1.7 + item.z * .48 });
export const gridPoint = (x: number, z: number) => ({ x: Math.max(0, Math.min(8, Math.round((x + 2.2) / .55))),
  z: Math.max(0, Math.min(6, Math.round((z + 1.7) / .48))) });

function Piece({ position, size, color }: { position: Position; size: Position; color: string }) {
  return <mesh position={position}><boxGeometry args={size} /><meshStandardMaterial color={color} /></mesh>;
}

function Furniture({ item, highlighted, onClick }: { item: RoomItem; highlighted: boolean; onClick: () => void }) {
  const point = world(item);
  const outline = highlighted ? '#f0c64e' : '#654b3e';
  return <group position={[point.x, 0, point.z]} onClick={(event) => { event.stopPropagation(); onClick(); }}>
    {item.kind === 'sofa' && <>
      <Piece position={[0, .38, 0]} size={[.95, .74, 1.2]} color="#63806e" />
      <Piece position={[-.4, .77, 0]} size={[.22, .65, 1.2]} color="#789681" />
      <Piece position={[.05, .72, -.26]} size={[.45, .22, .4]} color="#edd2a5" />
    </>}
    {item.kind === 'desk' && <>
      <Piece position={[0, .97, 0]} size={[1.45, .16, .75]} color="#80513a" />
      <Piece position={[-.57, .45, 0]} size={[.13, .9, .6]} color="#684634" />
      <Piece position={[.57, .45, 0]} size={[.13, .9, .6]} color="#684634" />
      <Piece position={[-.2, 1.13, .05]} size={[.5, .12, .34]} color="#f4ddaf" />
    </>}
    {item.kind === 'plant' && <>
      <Piece position={[0, .23, 0]} size={[.45, .42, .45]} color="#b46b55" />
      <Piece position={[0, .62, 0]} size={[.16, .43, .16]} color="#587e51" />
      <Piece position={[0, .82, 0]} size={[.45, .16, .3]} color="#729761" />
    </>}
    {item.kind === 'chair' && <>
      <Piece position={[0, .48, 0]} size={[.48, .12, .48]} color="#b98662" />
      <Piece position={[0, .8, -.19]} size={[.48, .62, .12]} color="#a96f57" />
      {[-.17, .17].map((x) => [-.17, .17].map((z) =>
        <Piece key={`${x}-${z}`} position={[x, .22, z]} size={[.08, .44, .08]} color="#80513a" />))}
    </>}
    {item.kind === 'lamp' && <>
      <Piece position={[0, .07, 0]} size={[.48, .14, .48]} color="#68516b" />
      <Piece position={[0, .76, 0]} size={[.1, 1.35, .1]} color="#806a79" />
      <Piece position={[0, 1.46, 0]} size={[.52, .4, .52]} color="#ffe5a2" />
    </>}
    {item.kind === 'bookshelf' && <>
      <Piece position={[0, .9, 0]} size={[.85, 1.8, .42]} color="#76533f" />
      {[.38, .9, 1.42].map((y) => <Piece key={y} position={[0, y, .23]} size={[.73, .08, .08]} color="#d8ae79" />)}
      <Piece position={[-.2, .57, .24]} size={[.16, .34, .1]} color="#8b6f99" />
      <Piece position={[.18, 1.1, .24]} size={[.2, .36, .1]} color="#66928b" />
    </>}
    {item.kind === 'flowers' && <>
      <Piece position={[0, .2, 0]} size={[.32, .4, .32]} color="#bd7667" />
      <Piece position={[0, .57, 0]} size={[.08, .38, .08]} color="#64865b" />
      {[-.13, .13].map((x) => <Piece key={x} position={[x, .78, 0]} size={[.2, .2, .2]} color="#ec91a5" />)}
    </>}
    {highlighted && <Piece position={[0, .012, 0]} size={[.72, .024, .72]} color={outline} />}
  </group>;
}

export function FurnitureScene({ items, editing, selectedId, onSelect, openTasks }: {
  items: RoomItem[]; editing: boolean; selectedId: string | null;
  onSelect: (id: string) => void; openTasks: () => void;
}) {
  return <>{items.map((item) => <Furniture key={item.id} item={item}
    highlighted={editing && selectedId === item.id}
    onClick={() => editing ? onSelect(item.id) : item.kind === 'desk' ? openTasks() : undefined} />)}</>;
}

export function useRoomFurniture(client: Client, spaceId: string) {
  const [layout, setLayout] = useState<RoomLayout>({ items: defaultRoomItems, unlocked_kinds: ['sofa','desk','plant'],
    revision: 0, progress: { completed_tasks: 0, active_days: 0 } });
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    const { data, error } = await client.rpc('get_room_layout', { space_key: spaceId });
    if (error || !data) throw error ?? new Error('Casa no disponible');
    setLayout(data as RoomLayout);
  }, [client, spaceId]);

  useEffect(() => {
    const update = () => { void refresh().catch(() => setMessage('No se pudo cargar la disposición de la casa.')); };
    const first = window.setTimeout(update, 0);
    const timer = window.setInterval(() => { if (!document.hidden) update(); }, 5000);
    window.addEventListener('focus', update);
    return () => { window.clearTimeout(first); window.clearInterval(timer); window.removeEventListener('focus', update); };
  }, [refresh]);

  async function save(items: RoomItem[], success: string) {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const { data, error } = await client.rpc('save_room_layout', {
        space_key: spaceId, expected_revision: layout.revision, chosen_items: items,
      });
      if (error) throw error;
      await refresh();
      setMessage(data === 'saved' ? success : data === 'conflict'
        ? 'La casa cambió en otro dispositivo. Revisa los muebles y vuelve a intentarlo.'
        : data === 'locked' ? 'Ese objeto todavía no está desbloqueado.' : 'No se pudo guardar la disposición.');
    } catch { setMessage('No se pudo guardar. Revisa tu conexión.'); }
    finally { setBusy(false); }
  }

  function place(x: number, z: number) {
    if (!editing || !selectedId) return false;
    const item = layout.items.find((entry) => entry.id === selectedId);
    if (!item) return true;
    if (layout.items.some((entry) => entry.id !== selectedId && entry.x === x && entry.z === z)) {
      setMessage('Ya hay un objeto en ese lugar.'); return true;
    }
    if (item.x === x && item.z === z) return true;
    void save(layout.items.map((entry) => entry.id === selectedId ? { ...entry, x, z } : entry), 'Mueble movido.');
    return true;
  }

  function add(kind: FurnitureKind) {
    const occupied = new Set(layout.items.map((item) => `${item.x}:${item.z}`));
    const available = Array.from({ length: 63 }, (_, index) => ({ x: index % 9, z: Math.floor(index / 9) }))
      .find((point) => !occupied.has(`${point.x}:${point.z}`));
    if (!available) { setMessage('No queda espacio para otro objeto.'); return; }
    const id = crypto.randomUUID();
    void save([...layout.items, { id, kind, ...available }], `${furnitureName(kind)} añadido.`);
    setSelectedId(id);
  }

  return { layout, editing, setEditing, selectedId, setSelectedId, busy, message, setMessage, save, place, add };
}

export function FurnitureControls({ state }: { state: ReturnType<typeof useRoomFurniture> }) {
  const { layout, editing, setEditing, selectedId, setSelectedId, busy, message, save, place, add } = state;
  const selected = layout.items.find((item) => item.id === selectedId);
  return <section className="furniture-editor" aria-labelledby="furniture-title">
    <div className="furniture-heading"><div><h2 id="furniture-title">Decora su casa</h2>
      <p>Los muebles se guardan para los dos. Desbloquea más con tareas y días de uso.</p></div>
      <button type="button" className={editing ? '' : 'secondary'} aria-pressed={editing}
        onClick={() => { setEditing(!editing); setSelectedId(null); }}>
        {editing ? 'Terminar decoración' : 'Mover y añadir muebles'}
      </button>
    </div>
    {editing && <>
      <p>{layout.progress.completed_tasks} tareas de la casa completadas · {layout.progress.active_days} días activos</p>
      <div className="furniture-catalog" aria-label="Catálogo de muebles">{catalog.map((entry) => {
        const unlocked = layout.unlocked_kinds.includes(entry.kind);
        const count = layout.items.filter((item) => item.kind === entry.kind).length;
        return <button type="button" key={entry.kind} className="secondary" disabled={busy || !unlocked || count >= entry.limit}
          title={unlocked ? `Máximo ${entry.limit}` : `Se desbloquea con ${entry.unlock}`}
          onClick={() => add(entry.kind)}>
          {entry.name} {unlocked ? count >= entry.limit ? '✓' : '+' : '🔒'}
          <small>{entry.unlock}</small>
        </button>;
      })}</div>
      {layout.items.length > 0 && <div className="furniture-items">
        <h3>Objetos en la casa</h3>
        <div>{layout.items.map((item) => <button type="button" key={item.id} className="secondary"
          aria-pressed={selectedId === item.id} onClick={() => setSelectedId(item.id)}>
          {furnitureName(item.kind)} · {item.x + 1},{item.z + 1}
        </button>)}</div>
      </div>}
      {selected && <div className="furniture-move">
        <p><strong>{furnitureName(selected.kind)} seleccionado.</strong> Toca el suelo de la casa o usa las flechas para moverlo.</p>
        <div role="group" aria-label={`Mover ${furnitureName(selected.kind)}`}>
          <button type="button" className="secondary" disabled={busy || selected.z === 0} onClick={() => place(selected.x, selected.z - 1)}>↑</button>
          <button type="button" className="secondary" disabled={busy || selected.x === 0} onClick={() => place(selected.x - 1, selected.z)}>←</button>
          <button type="button" className="secondary" disabled={busy || selected.x === 8} onClick={() => place(selected.x + 1, selected.z)}>→</button>
          <button type="button" className="secondary" disabled={busy || selected.z === 6} onClick={() => place(selected.x, selected.z + 1)}>↓</button>
          <button type="button" className="text-button" disabled={busy} onClick={() => {
            void save(layout.items.filter((entry) => entry.id !== selected.id), `${furnitureName(selected.kind)} retirado.`);
            setSelectedId(null);
          }}>Quitar</button>
        </div>
      </div>}
    </>}
    {message && <p role="status" className="notice">{message}</p>}
  </section>;
}

'use client';

import { Canvas } from '@react-three/fiber';

type Position = [number, number, number];

function Block({ position, size, color }: { position: Position; size: Position; color: string }) {
  return <mesh position={position}><boxGeometry args={size} /><meshStandardMaterial color={color} /></mesh>;
}

export default function Room({ completed, openTasks }: { completed: number; openTasks: () => void }) {
  return (
    <div className="room">
      <div className="room-art" aria-hidden="true">
        <Canvas orthographic camera={{ position: [8, 7, 10], zoom: 55 }} dpr={[1, 1.5]}
          frameloop="demand" fallback={<div className="room-fallback">La vista 3D requiere WebGL.</div>}>
          <color attach="background" args={['#e9ddc9']} />
          <ambientLight intensity={1.45} />
          <directionalLight position={[4, 7, 3]} intensity={2.1} />
          <Block position={[0, -0.2, 0]} size={[6, 0.4, 5]} color="#bb845f" />
          <Block position={[0, 1, -2.42]} size={[6, 2, 0.16]} color="#b0bda1" />
          <Block position={[-2.92, 1, 0]} size={[0.16, 2, 4.7]} color="#e3c5a1" />
          <Block position={[0.8, 0.02, 0.8]} size={[2.8, 0.04, 2.04]} color="#ae6554" />
          <Block position={[-1.8, 0.38, 0.55]} size={[0.95, 0.74, 2.08]} color="#63806e" />
          <Block position={[-2.2, 0.77, 0.55]} size={[0.25, 0.65, 2.08]} color="#789681" />
          <Block position={[-1.74, 0.72, 0.16]} size={[0.5, 0.23, 0.48]} color="#edd2a5" />
          <group onClick={(event) => { event.stopPropagation(); openTasks(); }}
            onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = ''; }}>
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
      <button className="desk-button" onClick={openTasks}>Abrir tareas del escritorio</button>
    </div>
  );
}

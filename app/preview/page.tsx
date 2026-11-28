import Image from 'next/image';
import Link from 'next/link';

export default function PreviewPage() {
  return <div className="shell">
    <a href="#contenido" className="skip-link">Ir al contenido</a>
    <header className="topbar"><div className="brand"><Image src="/icon-192.png" width={34} height={34} alt="" /> Our Space</div>
      <Link className="button-link" href="/">Entrar</Link></header>
    <main id="contenido" className="preview-layout">
      <section className="panel"><p className="preview-badge">Vista previa · datos de ejemplo</p>
        <h1>Su casa y el trabajo</h1>
        <p>Our Space une la organización de pareja con un espacio personal para repartir. Esta vista no guarda nada.</p>
        <div className="preview-grid">
          <div><h2>Casa</h2><p>Dos avatares pueden coincidir en la misma habitación. Cada persona mantiene sus tareas privadas y comparten las de la casa.</p>
            <div className="preview-pixels"><Image src="/cabin-pixel.png" width={240} height={164} alt="Ilustración pixel art de la casa" unoptimized /></div></div>
          <div><h2>Reparto</h2><p>Registra jornadas, cobros, gastos y combustible; consulta ganancias y una meta semanal.</p>
            <div className="courier-report-cards"><p><span>Ganancia de ejemplo</span><strong>S/ 280,00</strong></p>
              <p><span>Meta semanal</span><strong>70 %</strong></p></div></div>
        </div>
        <Link className="button-link" href="/">Crear mi cuenta</Link>
      </section>
    </main>
  </div>;
}

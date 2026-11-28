'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { connect } from '../lib/supabase';

type Client = NonNullable<ReturnType<typeof connect>>;
type Signal = { id: string; created_at: string; read_at: string | null };

const dateTime = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima',
});

export default function MissYou({ client, spaceId }: { client: Client; spaceId: string }) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [permission, setPermission] = useState<NotificationPermission | 'unavailable'>('unavailable');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const seen = useRef<Set<string> | null>(null);

  const refresh = useCallback(async () => {
    const { data, error } = await client.rpc('get_miss_you_inbox', { space_key: spaceId });
    if (error) throw error;
    const next = (data ?? []) as Signal[];
    if (seen.current && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      for (const item of next) {
        if (!item.read_at && !seen.current.has(item.id)) {
          try {
            new Notification('Te extraño ♥', {
              body: 'Tu pareja te envió un cariño en Our Space.', icon: '/icon-192.png',
              tag: `miss-you-${item.id}`,
            });
          } catch { /* La bandeja dentro de la app conserva el aviso. */ }
        }
      }
    }
    seen.current = new Set(next.map((item) => item.id));
    setSignals(next);
  }, [client, spaceId]);

  useEffect(() => {
    const update = () => { void refresh().catch(() => setMessage('No se pudieron cargar los avisos.')); };
    const first = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 5000);
    window.addEventListener('focus', update);
    if (typeof Notification !== 'undefined') {
      const current = Notification.permission;
      const permissionTimer = window.setTimeout(() => setPermission(current), 0);
      return () => { window.clearTimeout(first); window.clearTimeout(permissionTimer); window.clearInterval(timer); window.removeEventListener('focus', update); };
    }
    return () => { window.clearTimeout(first); window.clearInterval(timer); window.removeEventListener('focus', update); };
  }, [refresh]);

  async function send() {
    setBusy(true); setMessage('');
    try {
      const { data, error } = await client.rpc('send_miss_you', { space_key: spaceId });
      if (error) throw error;
      setMessage(data === 'sent' ? 'Se lo enviamos a tu pareja ♥' : data === 'cooldown'
        ? 'Ya se lo dijiste hace poco. Podrás enviar otro en 15 minutos.'
        : 'Ahora no se puede enviar. Comprueba que siguen vinculados.');
    } catch { setMessage('No se pudo enviar. Comprueba tu conexión.'); }
    finally { setBusy(false); }
  }

  async function markRead(id: string) {
    const { data, error } = await client.rpc('read_miss_you', { signal_key: id });
    if (error || !data) { setMessage('No se pudo marcar el aviso como leído.'); return; }
    await refresh().catch(() => setMessage('No se pudieron actualizar los avisos.'));
  }

  async function enableBrowserAlerts() {
    if (typeof Notification === 'undefined') return;
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      setMessage(result === 'granted' ? 'Avisos del navegador activados mientras la app esté abierta.'
        : 'Los avisos seguirán apareciendo dentro de Our Space.');
    } catch { setMessage('No se pudo activar el aviso del navegador.'); }
  }

  const unread = signals.filter((item) => !item.read_at);
  return <section className="miss-you-card" aria-label="Cariños de pareja">
    <div className="miss-you-copy">
      <span className="miss-you-heart" aria-hidden="true">♥</span>
      <div><strong>Un cariño para tu pareja</strong><p>Hazle saber que la extrañas. El mensaje queda guardado para cuando entre.</p></div>
    </div>
    <div className="miss-you-actions">
      <button type="button" disabled={busy} onClick={() => void send()}>Te extraño ♥</button>
      {permission === 'default' && <button type="button" className="secondary" onClick={() => void enableBrowserAlerts()}>Activar avisos</button>}
      <details className="miss-you-inbox">
        <summary>Mensajes recibidos {unread.length > 0 && <span className="miss-you-count">{unread.length} nuevos</span>}</summary>
        {signals.length === 0 ? <p>Cuando tu pareja te envíe un cariño, aparecerá aquí.</p>
          : <ul>{signals.slice(0, 10).map((item) => <li key={item.id}>
            <span>Tu pareja te extraña · {dateTime.format(new Date(item.created_at))}</span>
            {!item.read_at && <button type="button" className="text-button" onClick={() => void markRead(item.id)}>Marcar leído</button>}
          </li>)}</ul>}
      </details>
    </div>
    {message && <p className="miss-you-status" role="status">{message}</p>}
  </section>;
}

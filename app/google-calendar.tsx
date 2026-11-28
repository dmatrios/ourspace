'use client';

import { useEffect, useRef, useState } from 'react';

type CalendarTask = { id: string; title: string; due_on: string | null; requirements: string | null; completed: boolean };
type TokenResponse = { access_token?: string; expires_in?: number; error?: string };
type GoogleOAuth = {
  initTokenClient: (options: { client_id: string; scope: string; callback: (response: TokenResponse) => void }) =>
    { requestAccessToken: (options?: { prompt?: string }) => void };
  revoke: (token: string, callback: (response: { successful?: boolean; error?: string }) => void) => void;
};
type CalendarEvent = {
  id: string; summary?: string; description?: string; start?: { dateTime?: string };
  extendedProperties?: { private?: { ourspace_task?: string } };
};

const scope = 'https://www.googleapis.com/auth/calendar.app.created';
const endpoint = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

function oauth(): GoogleOAuth | undefined {
  return (window as Window & { google?: { accounts?: { oauth2?: GoogleOAuth } } }).google?.accounts?.oauth2;
}

async function calendarRequest<T>(token: string, url: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(response.status === 401 ? 'expired' : `calendar-${response.status}`);
  return response.status === 204 ? undefined as T : await response.json() as T;
}

function eventBody(task: CalendarTask, userId: string) {
  return {
    id: `a${task.id.replaceAll('-', '')}`,
    summary: `Our Space · ${task.title}`,
    description: task.requirements ? `Qué hace falta: ${task.requirements}` : 'Tarea de Our Space',
    start: { dateTime: `${task.due_on}T09:00:00-05:00`, timeZone: 'America/Lima' },
    end: { dateTime: `${task.due_on}T09:15:00-05:00`, timeZone: 'America/Lima' },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] },
    extendedProperties: { private: { ourspace_user: userId, ourspace_task: task.id } },
  };
}

async function syncEvents(token: string, userId: string, tasks: CalendarTask[]): Promise<number> {
  const existing = new Map<string, CalendarEvent>();
  let pageToken: string | undefined;
  do {
    const url = new URL(endpoint);
    url.searchParams.set('privateExtendedProperty', `ourspace_user=${userId}`);
    url.searchParams.set('maxResults', '2500');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const page = await calendarRequest<{ items?: CalendarEvent[]; nextPageToken?: string }>(token, url.toString());
    for (const event of page.items ?? []) existing.set(event.id, event);
    pageToken = page.nextPageToken;
  } while (pageToken);

  const active = new Set<string>();
  for (const task of tasks) {
    if (task.completed || !task.due_on) continue;
    const event = eventBody(task, userId);
    active.add(event.id);
    const found = existing.get(event.id);
    if (!found) {
      await calendarRequest(token, endpoint, 'POST', event);
    } else if (found.summary !== event.summary || found.description !== event.description
      || found.start?.dateTime?.slice(0, 16) !== event.start.dateTime.slice(0, 16)) {
      await calendarRequest(token, `${endpoint}/${encodeURIComponent(event.id)}`, 'PATCH', event);
    }
  }
  for (const event of existing.values()) {
    if (!active.has(event.id)) await calendarRequest(token, `${endpoint}/${encodeURIComponent(event.id)}`, 'DELETE');
  }
  return active.size;
}

export default function GoogleCalendar({ userId, tasks }: { userId: string; tasks: CalendarTask[] }) {
  const [ready, setReady] = useState(() => typeof window !== 'undefined' && Boolean(oauth()));
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [syncRequest, setSyncRequest] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const lastSync = useRef('');
  const fingerprint = JSON.stringify(tasks.map(({ id, title, due_on, requirements, completed }) =>
    [id, title, due_on, requirements, completed]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));

  useEffect(() => {
    if (!clientId) return;
    if (oauth()) return;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => setReady(Boolean(oauth()));
    script.onerror = () => setMessage('No se pudo cargar la conexión con Google. Inténtalo de nuevo.');
    document.head.appendChild(script);
    return () => { script.onload = null; script.onerror = null; };
  }, []);

  useEffect(() => {
    if (!token) return;
    const timer = window.setTimeout(() => {
      setToken(null);
      setMessage('La conexión temporal caducó. Conecta Google Calendar otra vez para sincronizar.');
    }, Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [token, expiresAt]);

  useEffect(() => {
    if (!token || syncing) return;
    const key = `${token}:${fingerprint}:${syncRequest}`;
    if (lastSync.current === key) return;
    setSyncing(true);
    void syncEvents(token, userId, tasks).then((count) => {
      lastSync.current = key;
      setMessage(`${count} ${count === 1 ? 'tarea pendiente sincronizada' : 'tareas pendientes sincronizadas'} con Google Calendar.`);
    }).catch((error: unknown) => {
      if (error instanceof Error && error.message === 'expired') {
        setToken(null);
        setMessage('La sesión de Google caducó. Vuelve a conectar el calendario.');
      } else setMessage('No se pudieron sincronizar las tareas. Revisa los permisos de Calendar y vuelve a intentar.');
      lastSync.current = key;
    }).finally(() => setSyncing(false));
  }, [token, syncing, fingerprint, syncRequest, userId, tasks]);

  function connect() {
    if (!clientId || !oauth()) return;
    setMessage('');
    oauth()?.initTokenClient({
      client_id: clientId, scope,
      callback: (response) => {
        if (!response.access_token) {
          setMessage('Google no concedió acceso a Calendar. Puedes intentarlo otra vez.');
          return;
        }
        setExpiresAt(Date.now() + Math.max(0, (response.expires_in ?? 3600) - 60) * 1000);
        setToken(response.access_token);
      },
    }).requestAccessToken({ prompt: 'select_account' });
  }

  function revoke() {
    if (!token || !oauth()) return;
    oauth()?.revoke(token, (result) => {
      if (!result.successful) {
        setMessage('Google no confirmó la revocación. Inténtalo otra vez.');
        return;
      }
      setToken(null);
      lastSync.current = '';
      setMessage('Acceso a Google Calendar revocado. Los eventos ya creados permanecen en tu calendario.');
    });
  }

  return (
    <section className="calendar-connect" aria-labelledby="calendar-connect-title">
      <h2 id="calendar-connect-title">Google Calendar</h2>
      <p>Cada persona conecta su propio calendario. Las tareas pendientes con fecha se agregan a las 9:00 a. m. (Lima), con aviso 30 minutos antes.</p>
      {!clientId ? <p>La conexión con Google Calendar aún no está configurada.</p> : <div className="calendar-actions">
        {!token ? <button type="button" className="secondary" disabled={!ready} onClick={connect}>
          {ready ? 'Conectar mi Google Calendar' : 'Preparando Google Calendar…'}
        </button> : <>
          <button type="button" disabled={syncing} onClick={() => setSyncRequest((value) => value + 1)}>
            {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
          </button>
          <button type="button" className="secondary" disabled={syncing} onClick={revoke}>Revocar acceso</button>
        </>}
      </div>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

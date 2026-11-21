'use client';

import type { Session } from '@supabase/supabase-js';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { connect } from '../lib/supabase';

const Room = dynamic(() => import('./room'), { ssr: false, loading: () => <div className="room-fallback">Cargando habitación…</div> });

type Client = NonNullable<ReturnType<typeof connect>>;
type Space = { id: string; state: 'waiting' | 'paired' | 'separated' | 'retained' };
type Task = { id: string; space_id: string | null; title: string; completed: boolean; created_at: string };

export default function SpaceApp() {
  const [client] = useState(connect);
  const [session, setSession] = useState<Session | null>();
  const [register, setRegister] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!client) return;
    const { data } = client.auth.onAuthStateChange((event, current) => {
      setSession(current);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setMessage('');
    });
    return () => data.subscription.unsubscribe();
  }, [client]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email')).trim();
    const password = String(form.get('password'));
    setBusy(true);
    setMessage('');
    try {
      const result = register
        ? await client.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error) setMessage(register ? 'No se pudo crear la cuenta. Comprueba que tu correo esté autorizado.' : 'No se pudo iniciar sesión. Revisa tu correo y contraseña.');
      else if (register && !result.data.session) setMessage('Revisa tu correo y abre el enlace en este navegador.');
    } catch {
      setMessage('No se pudo completar la conexión. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><span aria-hidden="true">⌂</span> Our Space</div>
        {session && client && <button className="secondary" onClick={async () => {
          const { error } = await client.auth.signOut();
          if (error) setMessage('No se pudo cerrar la sesión. Inténtalo de nuevo.');
        }}>Cerrar sesión</button>}
      </header>
      {message && <p role="status" className="notice">{message}</p>}
      {!client ? (
        <section className="panel welcome">
          <h1>Prepara tu espacio</h1>
          <p>Configura la conexión con Supabase para acceder a la casa y a tus tareas.</p>
        </section>
      ) : session === undefined ? <p role="status">Comprobando sesión…</p> : session ? (
        <Workspace key={session.user.id} client={client} userId={session.user.id} />
      ) : (
        <section className="panel welcome">
          <h1>{register ? 'Crea tu cuenta' : 'Entra a tu espacio'}</h1>
          <form onSubmit={authenticate} className="stack">
            <label>Correo electrónico<input name="email" type="email" autoComplete="email" required /></label>
            <label>Contraseña<input name="password" type="password" minLength={register ? 8 : undefined}
              autoComplete={register ? 'new-password' : 'current-password'} required /></label>
            <button disabled={busy}>{register ? 'Crear cuenta' : 'Iniciar sesión'}</button>
          </form>
          <button className="text-button" onClick={() => { setRegister(!register); setMessage(''); }}>
            {register ? 'Ya tengo una cuenta' : 'Crear una cuenta'}
          </button>
        </section>
      )}
    </main>
  );
}

function Workspace({ client, userId }: { client: Client; userId: string }) {
  const [space, setSpace] = useState<Space | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [invite, setInvite] = useState('');
  const [tab, setTab] = useState<'home' | 'tasks'>('home');
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [readError, setReadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState(false);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    const [home, list, request] = await Promise.all([
      client.from('spaces').select('id,state').maybeSingle(),
      client.from('tasks').select('id,space_id,title,completed,created_at').order('created_at', { ascending: false }),
      client.rpc('pending_partner'),
    ]);
    if (current !== generation.current) return;
    if (home.error || list.error || request.error) {
      setReadError(true);
      return;
    }
    setReadError(false);
    setSpace(home.data);
    setTasks(list.data.filter((item) => item.space_id === null || item.space_id === home.data?.id));
    setPending(request.data);
    if (home.data?.state !== 'waiting') setInvite('');
    setLoaded(true);
  }, [client]);

  useEffect(() => {
    const update = () => { void refresh().catch(() => setReadError(true)); };
    const invalidate = () => { generation.current++; };
    update();
    window.addEventListener('focus', update);
    const timer = window.setInterval(() => { if (!document.hidden) update(); }, 5000);
    return () => {
      invalidate();
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, [refresh]);

  async function act(operation: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await operation();
      await refresh();
    } catch {
      setMessage('No se pudo completar la operación. Actualiza el espacio e inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const code = String(new FormData(form).get('code'));
    void act(async () => {
      const { data, error } = await client.rpc('request_invitation', { invite_code: code });
      if (error) throw error;
      setMessage(data ? 'Solicitud enviada. La otra persona debe aprobarla.' : 'Este código no está disponible. Revisa el código o inténtalo más tarde.');
      if (data) form.reset();
    });
  }

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get('title')).trim();
    if (!title) { setMessage('Escribe un título para la tarea.'); return; }
    void act(async () => {
      const { error } = await client.from('tasks').insert({
        title, owner_id: userId, space_id: data.get('scope') === 'home' ? space?.id : null,
      });
      if (error) throw error;
      form.reset();
    });
  }

  const hasHome = space?.state === 'paired' || space?.state === 'retained' || space?.state === 'separated';
  const canEditHome = hasHome && space.state !== 'separated';
  const homeTasks = tasks.filter((task) => task.space_id === space?.id);
  const completed = homeTasks.filter((task) => task.completed).length;

  return (
    <>
      <nav aria-label="Vistas" className="tabs">
        <button aria-pressed={tab === 'home'} onClick={() => setTab('home')}>Casa</button>
        <button aria-pressed={tab === 'tasks'} onClick={() => setTab('tasks')}>Tareas</button>
      </nav>
      {message && <p role="status" className="notice">{message}</p>}
      {readError && <p role="status" className="notice">No se pudieron actualizar los datos. Comprueba tu conexión.</p>}
      {!loaded || readError ? (!readError && <p role="status">Cargando tu espacio…</p>) : tab === 'home' ? (
        <section className="panel">
          <h1>{hasHome ? 'Nuestra casa' : 'Crea su espacio'}</h1>
          {hasHome ? (
            <>
              <p>{completed} de {homeTasks.length} tareas de la casa completadas</p>
              <Room completed={completed} openTasks={() => setTab('tasks')} />
              {space.state === 'paired' && <button className="text-button" disabled={busy} onClick={() => {
                if (!window.confirm('¿Quieres desvincularte? Perderás acceso a la casa y sus tareas compartidas.')) return;
                void act(async () => {
                  const { data, error } = await client.rpc('leave_space');
                  if (error || !data) throw error ?? new Error('Space changed');
                });
              }}>Desvincularme</button>}
              {space.state === 'separated' && (
                <div className="stack separation">
                  <p>La otra persona se desvinculó. Puedes conservar la casa con su historial o descargar una copia antes de eliminarla.</p>
                  <button disabled={busy} onClick={() => void act(async () => {
                    const { data, error } = await client.rpc('settle_space', { keep_home: true });
                    if (error || !data) throw error ?? new Error('Space changed');
                  })}>Conservar la casa y su historial</button>
                  <button className="secondary" disabled={busy} onClick={() => void act(async () => {
                    const { data, error } = await client.rpc('export_separated_space');
                    if (error || !data) throw error ?? new Error('Space unavailable');
                    const file = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(file);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'our-space.json';
                    link.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                    setExported(true);
                  })}>Descargar copia</button>
                  {exported && <button className="danger" disabled={busy} onClick={() => {
                    if (!window.confirm('Confirma que guardaste la copia. ¿Eliminar la casa y sus tareas compartidas de forma permanente?')) return;
                    void act(async () => {
                      const { data, error } = await client.rpc('settle_space', { keep_home: false });
                      if (error || !data) throw error ?? new Error('Space changed');
                      setExported(false);
                    });
                  }}>Eliminar casa y datos compartidos</button>}
                </div>
              )}
            </>
          ) : (
            <div className="pair-grid">
              <div className="stack">
                <h2>Invitar a mi pareja</h2>
                <p>Comparte el código en privado. Caduca en 24 horas.</p>
                {invite && <output className="invite">{invite}</output>}
                {pending && <button disabled={busy} onClick={() => void act(async () => {
                  const { data, error } = await client.rpc('approve_partner', { expected_email: pending });
                  if (error || !data) throw error ?? new Error('Request changed');
                })}>Aceptar a {pending}</button>}
                <button className={pending ? 'secondary' : undefined} disabled={busy} onClick={() => {
                  if (pending && !window.confirm('Generar otro código cancelará la solicitud pendiente. ¿Continuar?')) return;
                  void act(async () => {
                    const { data, error } = await client.rpc('issue_invitation');
                    if (error) throw error;
                    setInvite(data);
                  });
                }}>{space ? 'Generar otro código' : 'Crear espacio y código'}</button>
              </div>
              {!space && <form onSubmit={join} className="stack">
                <h2>Unirme a un espacio</h2>
                <label>Código de invitación<input name="code" autoCapitalize="characters" autoComplete="off" spellCheck={false} required /></label>
                <button disabled={busy} className="secondary">Enviar solicitud</button>
              </form>}
            </div>
          )}
        </section>
      ) : (
        <section className="panel">
          <h1>Tareas</h1>
          <form className="task-form" onSubmit={addTask}>
            <label>Nueva tarea<input name="title" maxLength={160} required placeholder="¿Qué hay que hacer?" /></label>
            <label>Visibilidad<select name="scope" defaultValue="personal"><option value="personal">Solo yo</option>
              {canEditHome && <option value="home">{space.state === 'retained' ? 'Casa conservada' : 'Compartida'}</option>}</select></label>
            <button disabled={busy}>Añadir</button>
          </form>
          {tasks.length === 0 ? <p>Aún no hay tareas.</p> : (
            <ul className="tasks">
              {tasks.map((task) => <li key={task.id}>
                <label><input type="checkbox" checked={task.completed} disabled={busy || (task.space_id !== null && !canEditHome)}
                  onChange={(event) => {
                    const done = event.currentTarget.checked;
                    void act(async () => {
                      const { data, error } = await client.from('tasks').update({ completed: done }).eq('id', task.id).select('id').maybeSingle();
                      if (error || !data) throw error ?? new Error('Task unavailable');
                    });
                  }} /><span>{task.title}</span></label>
                <small>{task.space_id ? 'Casa' : 'Personal'}</small>
                <button type="button" className="text-button" disabled={busy || (task.space_id !== null && !canEditHome)}
                  aria-label={'Eliminar ' + task.title} onClick={() => {
                    if (!window.confirm('¿Eliminar esta tarea?')) return;
                    void act(async () => {
                      const { data, error } = await client.from('tasks').delete().eq('id', task.id).select('id').maybeSingle();
                      if (error || !data) throw error ?? new Error('Task unavailable');
                    });
                  }}>Eliminar</button>
              </li>)}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

'use client';

import type { Session } from '@supabase/supabase-js';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import CoupleOnboarding, { type CoupleOnboardingData } from './couple-onboarding';
import { defaultAvatar, type AvatarAppearance, type MemberAvatar } from './avatar';
import InvitationActions from './invitation-actions';
import PixelSelect, { type PixelSelectOption } from './pixel-select';
import { connect } from '../lib/supabase';
import { defaultRoomStyle, roomPalettes, type RoomPalette, type RoomStyle } from '../lib/room-style';

const Room = dynamic(() => import('./room'), { ssr: false, loading: () => <div className="room-fallback">Cargando habitación…</div> });

type Client = NonNullable<ReturnType<typeof connect>>;
type Space = { id: string; state: 'waiting' | 'paired' | 'separated' | 'retained' };
type Task = { id: string; space_id: string | null; title: string; completed: boolean; created_at: string };

const taskVisibilityOptions: PixelSelectOption[] = [
  { value: 'personal', label: 'Solo yo' },
  { value: 'home', label: 'Compartida' },
];

export default function SpaceApp() {
  const [client] = useState(connect);
  const [session, setSession] = useState<Session | null>();
  const [register, setRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);
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
    if (register && password !== String(form.get('password_confirmation'))) {
      setMessage('Las contraseñas no coinciden.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const result = register
        ? await client.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error) {
        const authError = result.error.message.toLowerCase();
        const emailDeliveryBlocked = register && /email[_ ]address[_ ]not[_ ]authorized/.test(authError);
        const emailRateLimited = register && /over_email_send_rate_limit|email rate limit exceeded/.test(authError);
        setMessage(emailDeliveryBlocked
          ? 'Supabase no pudo enviar la confirmación a este correo. Configura SMTP para enviar correos externos.'
          : emailRateLimited
            ? 'Se alcanzó el límite temporal de correos de confirmación. Inténtalo más tarde.'
            : register ? 'No se pudo crear la cuenta. Revisa el correo y que la contraseña cumpla los requisitos.' : 'No se pudo iniciar sesión. Revisa tu correo y contraseña.');
      }
      else if (register && !result.data.session) setMessage('Revisa tu correo y abre el enlace en este navegador.');
    } catch {
      setMessage('No se pudo completar la conexión. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <a href="#contenido" className="skip-link">Ir al contenido</a>
      <header className="topbar">
        <div className="brand"><Image src="/icon-192.png" width={34} height={34} alt="" /> Our Space</div>
        {session && client && <button className="secondary" onClick={async () => {
          const { error } = await client.auth.signOut();
          if (error) setMessage('No se pudo cerrar la sesión. Inténtalo de nuevo.');
        }}>Cerrar sesión</button>}
      </header>
      <main id="contenido" tabIndex={-1}>
        {message && <p role="status" className="notice">{message}</p>}
        {!client ? (
          <section className="panel welcome">
            <h1>Prepara tu espacio</h1>
            <p>Configura la conexión con Supabase para acceder a la casa y a tus tareas.</p>
          </section>
        ) : session === undefined ? <p role="status">Comprobando sesión…</p> : session ? (
          <Workspace key={session.user.id} client={client} userId={session.user.id} />
        ) : (
          <section className="entry">
            <div className="cabin">
              <Image src="/cabin-pixel.png" alt="" width={240} height={164} unoptimized preload />
            </div>
            <div className="panel welcome">
              <h1>{register ? 'Crea tu cuenta' : 'Entra a su casa'}</h1>
              <p>Una casa virtual para organizar su día a día juntos.</p>
              <form onSubmit={authenticate} className="stack">
                <label>Correo electrónico<input name="email" type="email" autoComplete="email" spellCheck={false} required /></label>
                <label>Contraseña
                  <span className="password-field">
                    <input name="password" type={showPassword ? 'text' : 'password'} minLength={register ? 8 : undefined}
                      autoComplete={register ? 'new-password' : 'current-password'} required />
                    <button type="button" className="secondary password-toggle" aria-pressed={showPassword}
                      onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Ocultar' : 'Mostrar'}</button>
                  </span>
                </label>
                {register && <>
                  <label>Confirmar contraseña
                    <span className="password-field">
                      <input name="password_confirmation" type={showPasswordConfirmation ? 'text' : 'password'} minLength={8}
                        autoComplete="new-password" required />
                      <button type="button" className="secondary password-toggle" aria-pressed={showPasswordConfirmation}
                        onClick={() => setShowPasswordConfirmation(!showPasswordConfirmation)}>
                        {showPasswordConfirmation ? 'Ocultar' : 'Mostrar'}
                      </button>
                    </span>
                  </label>
                  <p className="auth-hint">Te enviaremos un enlace para confirmar tu correo antes de iniciar sesión.</p>
                </>}
                <button disabled={busy}>{busy ? 'Conectando…' : register ? 'Crear cuenta' : 'Iniciar sesión'}</button>
              </form>
              <button className="text-button" onClick={() => {
                setRegister(!register);
                setShowPassword(false);
                setShowPasswordConfirmation(false);
                setMessage('');
              }}>
                {register ? 'Ya tengo una cuenta' : 'Crear una cuenta'}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Workspace({ client, userId }: { client: Client; userId: string }) {
  const [memberAvatar, setMemberAvatar] = useState<MemberAvatar>(defaultAvatar);
  const [avatarReadError, setAvatarReadError] = useState(false);
  const [onboarding, setOnboarding] = useState<CoupleOnboardingData | null>(null);
  const [roomStyle, setRoomStyle] = useState<RoomStyle | null>(null);
  const [space, setSpace] = useState<Space | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [invite, setInvite] = useState('');
  const [tab, setTab] = useState<'home' | 'tasks'>('home');
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [readError, setReadError] = useState(false);
  const [onboardingError, setOnboardingError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState(false);
  const [taskScope, setTaskScope] = useState('personal');
  const generation = useRef(0);

  const refreshAvatar = useCallback(async () => {
    const { data, error } = await client.rpc('get_member_avatar');
    if (error) throw error;
    setMemberAvatar(data as MemberAvatar);
    setAvatarReadError(false);
  }, [client]);

  const saveAvatar = useCallback(async (appearance: AvatarAppearance) => {
    const { data, error } = await client.rpc('save_member_avatar', {
      chosen_silhouette: appearance.silhouette,
      chosen_hair_style: appearance.hair_style,
      chosen_hair_color: appearance.hair_color,
      chosen_outfit: appearance.outfit,
    });
    if (error) throw error;
    if (data !== 'saved') throw new Error(data === 'locked' ? 'Avatar option locked' : 'Invalid avatar option');
    await refreshAvatar();
  }, [client, refreshAvatar]);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    const [home, list, request] = await Promise.all([
      client.from('spaces').select('id,state').maybeSingle(),
      client.from('tasks').select('id,space_id,title,completed,created_at').order('created_at', { ascending: false }),
      client.rpc('pending_partner'),
    ]);
    if (current !== generation.current) return;
    const introductionPromise = home.data
      ? client.rpc('get_couple_onboarding', { space_key: home.data.id })
      : null;
    const stylePromise = home.data && home.data.state !== 'waiting'
      ? client.from('room_styles').select('palette,revision').eq('space_id', home.data.id).maybeSingle()
      : null;
    const [style, introduction] = await Promise.all([
      stylePromise ?? Promise.resolve(null),
      introductionPromise ?? Promise.resolve(null),
    ]);
    if (current !== generation.current) return;
    if (home.error || list.error || request.error) {
      setReadError(true);
      return;
    }
    setReadError(false);
    setOnboardingError(Boolean(introduction?.error));
    setSpace(home.data);
    setOnboarding(introduction && !introduction.error ? introduction.data : null);
    setRoomStyle(style && !style.error ? style.data ?? defaultRoomStyle : null);
    setTasks(list.data.filter((item) => item.space_id === null || item.space_id === home.data?.id));
    setPending(request.data);
    if (home.data?.state !== 'waiting') setInvite('');
    setLoaded(true);
  }, [client]);

  useEffect(() => {
    const update = () => { void refresh().catch(() => setReadError(true)); };
    const invalidate = () => { generation.current++; };
    update();
    void refreshAvatar().catch(() => setAvatarReadError(true));
    window.addEventListener('focus', update);
    const timer = window.setInterval(() => { if (!document.hidden) update(); }, 5000);
    return () => {
      invalidate();
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, [refresh, refreshAvatar]);

  async function act(operation: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await operation();
      await Promise.all([refresh(), refreshAvatar().catch(() => setAvatarReadError(true))]);
    } catch {
      setMessage('No se pudo completar la operación. Actualiza el espacio e inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const code = String(new FormData(form).get('code')).trim();
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
      setTaskScope('personal');
    });
  }

  const hasHome = space?.state === 'paired' || space?.state === 'retained' || space?.state === 'separated';
  const canEditHome = hasHome && space.state !== 'separated';
  const canEditCoupleProfile = Boolean(space && space.state !== 'separated');
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
      {avatarReadError && <p role="status" className="notice">No se pudo cargar la personalización del avatar. Comprueba si está aplicada la migración de avatares.</p>}
      {!loaded || readError ? (!readError && <p role="status">Cargando tu espacio…</p>) : tab === 'home' ? (
        <section className="panel">
          <h1>{hasHome ? 'Nuestra casa' : 'Crea su espacio'}</h1>
          {hasHome ? (
            <>
              {onboarding && <CoupleOnboarding key={space.id} data={onboarding} paired={space.state === 'paired'}
                canEdit={canEditHome} onSave={async (values) => {
                  const { data, error } = await client.rpc('save_couple_onboarding', { space_key: space.id, ...values });
                  if (error) throw error;
                  await refresh();
                  return data;
                }} />}
              <div className="house-progress">
                <p role="status">{completed} de {homeTasks.length} tareas de la casa completadas</p>
                {homeTasks.length > 0 && <progress aria-label="Progreso de tareas de la casa" value={completed} max={homeTasks.length} />}
              </div>
              <Room key={space.id} completed={completed} palette={roomStyle?.palette ?? 'forest'} avatar={memberAvatar}
                onAvatarChange={saveAvatar} openTasks={() => setTab('tasks')} />
              {canEditHome && roomStyle && (
                <fieldset className="room-palettes" disabled={busy}>
                  <legend>Decoración de la casa</legend>
                  {(Object.keys(roomPalettes) as RoomPalette[]).map((palette) => (
                    <button key={palette} type="button" className="secondary" aria-pressed={roomStyle.palette === palette}
                      onClick={() => {
                        if (roomStyle.palette === palette) return;
                        void act(async () => {
                          const { data, error } = await client.rpc('save_room_style', {
                            palette_name: palette, expected_revision: roomStyle.revision,
                          });
                          if (error) throw error;
                          setMessage(data ? 'Decoración guardada.' : 'La decoración cambió en otra sesión. Revisa la casa e inténtalo de nuevo.');
                        });
                      }}>
                      <span aria-hidden="true" style={{ background: roomPalettes[palette].rug }} />
                      {roomPalettes[palette].label}
                    </button>
                  ))}
                </fieldset>
              )}
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
            <>
              {space?.state === 'waiting' && onboardingError && <p role="status" className="notice">
                No se pudo cargar tu presentación. Comprueba tu conexión y vuelve a cargar el espacio.
              </p>}
              {space?.state === 'waiting' && onboarding && <CoupleOnboarding key={space.id} data={onboarding} paired={false}
                canEdit={canEditCoupleProfile} onSave={async (values) => {
                  const { data, error } = await client.rpc('save_couple_onboarding', { space_key: space.id, ...values });
                  if (error) throw error;
                  await refresh();
                  return data;
                }} />}
              <div className="pair-grid">
                <div className="stack">
                  <h2>Invitar a mi pareja</h2>
                  <p>Comparte el código en privado. Caduca en 24 horas.</p>
                  {invite && <div className="invite-card">
                    <span className="invite-caption">Código de invitación</span>
                    <output className="invite" aria-label="Código de invitación">{invite}</output>
                    <InvitationActions code={invite} />
                  </div>}
                  {pending && <button disabled={busy} onClick={() => void act(async () => {
                    const { data, error } = await client.rpc('approve_partner', { expected_email: pending });
                    if (error || !data) throw error ?? new Error('Request changed');
                  })}>Aceptar a {pending}</button>}
                  <button className={pending ? 'secondary' : undefined} disabled={busy} onClick={() => {
                    if (pending && !window.confirm('Generar otro código cancelará la solicitud pendiente. ¿Continuar?')) return;
                    void act(async () => {
                      const { data, error } = await client.rpc('issue_invitation');
                      if (error) throw error;
                      if (typeof data !== 'string' || !/^\d{6}$/.test(data)) {
                        setInvite('');
                        setMessage('La base de datos aún genera códigos antiguos. Aplica la migración pendiente para habilitar códigos de 6 dígitos.');
                        return;
                      }
                      setInvite(data);
                    });
                  }}>{space ? 'Generar otro código' : 'Crear espacio y código'}</button>
                </div>
                {!space && <form onSubmit={join} className="stack">
                  <h2>Unirme a un espacio</h2>
                  <label>Código de invitación<input name="code" inputMode="numeric" autoComplete="one-time-code"
                    pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="000000" aria-describedby="invite-code-help" required /></label>
                  <p id="invite-code-help" className="field-hint">Escribe los 6 dígitos que te compartieron.</p>
                  <button disabled={busy} className="secondary">Enviar solicitud</button>
                </form>}
              </div>
            </>
          )}
        </section>
      ) : (
        <section className="panel">
          <h1>Tareas</h1>
          <form className="task-form" onSubmit={addTask}>
            <label>Nueva tarea<input name="title" maxLength={160} required placeholder="¿Qué hay que hacer?" /></label>
            <PixelSelect label="Visibilidad" name="scope" onValueChange={setTaskScope}
              options={canEditHome ? [taskVisibilityOptions[0], {
                value: 'home', label: space.state === 'retained' ? 'Casa conservada' : 'Compartida',
              }] : [taskVisibilityOptions[0]]}
              value={canEditHome && taskScope === 'home' ? 'home' : 'personal'} />
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

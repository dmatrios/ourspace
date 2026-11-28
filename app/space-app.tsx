'use client';

import type { Session } from '@supabase/supabase-js';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import CoupleOnboarding, { type CoupleOnboardingData } from './couple-onboarding';
import GoogleCalendar from './google-calendar';
import { defaultAvatar, type AvatarAppearance, type MemberAvatar } from './avatar';
import InvitationActions from './invitation-actions';
import PixelSelect, { type PixelSelectOption } from './pixel-select';
import { connect } from '../lib/supabase';
import { defaultRoomStyle, roomPalettes, type RoomPalette, type RoomStyle } from '../lib/room-style';

const Room = dynamic(() => import('./room'), { ssr: false, loading: () => <div className="room-fallback">Cargando habitación…</div> });
const Expenses = dynamic(() => import('./expenses'), { ssr: false, loading: () => <p>Cargando gastos…</p> });
const CourierWork = dynamic(() => import('./courier-work'), { ssr: false, loading: () => <p>Cargando trabajo…</p> });
const AccountSettings = dynamic(() => import('./account-settings'), { ssr: false, loading: () => <p>Cargando cuenta…</p> });

type Client = NonNullable<ReturnType<typeof connect>>;
type Space = { id: string; owner_id: string; state: 'waiting' | 'paired' | 'separated' | 'retained' };
type TaskPriority = 'high' | 'medium' | 'low';
type TaskView = 'backlog' | 'today' | 'tomorrow' | 'date';
type Task = {
  id: string; space_id: string | null; title: string; completed: boolean;
  priority: TaskPriority; due_on: string | null; requirements: string | null; created_at: string;
};

const taskPriorityOptions: PixelSelectOption[] = [
  { value: 'high', label: 'Alta' },
  { value: 'medium', label: 'Normal' },
  { value: 'low', label: 'Baja' },
];

const taskVisibilityOptions: PixelSelectOption[] = [
  { value: 'personal', label: 'Solo yo' },
  { value: 'home', label: 'Compartida' },
];

function limaDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function followingDate(day: string): string {
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export default function SpaceApp() {
  const [client] = useState(connect);
  const [session, setSession] = useState<Session | null>();
  const [register, setRegister] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [recoveringPassword, setRecoveringPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!client) return;
    const { data } = client.auth.onAuthStateChange((event, current) => {
      setSession(current);
      if (event === 'PASSWORD_RECOVERY') setRecoveringPassword(true);
      if (event === 'SIGNED_OUT') setRecoveringPassword(false);
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

  async function requestPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!client) return;
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim();
    setBusy(true); setMessage('');
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    setMessage(error ? 'No se pudo solicitar el enlace. Inténtalo de nuevo.' :
      'Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña.');
    setBusy(false);
  }

  async function updateRecoveredPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!client) return;
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password') ?? '');
    if (password !== data.get('confirmation')) { setMessage('Las contraseñas no coinciden.'); return; }
    setBusy(true); setMessage('');
    const { error } = await client.auth.updateUser({ password });
    if (error) setMessage('No se pudo cambiar la contraseña. Revisa los requisitos e inténtalo de nuevo.');
    else {
      await client.auth.signOut();
      setRecoveringPassword(false);
      setMessage('Contraseña actualizada. Inicia sesión con la nueva contraseña.');
    }
    setBusy(false);
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
        ) : session === undefined ? <p role="status">Comprobando sesión…</p> : recoveringPassword && session ? (
          <section className="panel welcome">
            <h1>Nueva contraseña</h1>
            <p>El enlace de recuperación ya confirmó tu identidad. Elige una contraseña nueva.</p>
            <form className="stack" onSubmit={updateRecoveredPassword}>
              <label>Contraseña nueva<input type="password" name="password" minLength={8} autoComplete="new-password" required /></label>
              <label>Confirmar contraseña<input type="password" name="confirmation" minLength={8} autoComplete="new-password" required /></label>
              <button disabled={busy}>Guardar contraseña</button>
            </form>
          </section>
        ) : session ? (
          <Workspace key={session.user.id} client={client} userId={session.user.id} email={session.user.email ?? ''} />
        ) : forgotPassword ? (
          <section className="panel welcome">
            <h1>Recupera tu cuenta</h1>
            <p>Te enviaremos un enlace para elegir una nueva contraseña.</p>
            <form className="stack" onSubmit={requestPasswordReset}>
              <label>Correo electrónico<input type="email" name="email" autoComplete="email" required /></label>
              <button disabled={busy}>Enviar enlace</button>
            </form>
            <button type="button" className="text-button" onClick={() => { setForgotPassword(false); setMessage(''); }}>Volver a iniciar sesión</button>
          </section>
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
              {!register && <button type="button" className="text-button" onClick={() => { setForgotPassword(true); setMessage(''); }}>
                Olvidé mi contraseña
              </button>}
              <Link className="text-link" href="/preview">Ver una vista previa</Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Workspace({ client, userId, email }: { client: Client; userId: string; email: string }) {
  const [memberAvatar, setMemberAvatar] = useState<MemberAvatar>(defaultAvatar);
  const [avatarReadError, setAvatarReadError] = useState(false);
  const [onboarding, setOnboarding] = useState<CoupleOnboardingData | null>(null);
  const [roomStyle, setRoomStyle] = useState<RoomStyle | null>(null);
  const [space, setSpace] = useState<Space | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [invite, setInvite] = useState('');
  const [tab, setTab] = useState<'home' | 'tasks' | 'expenses' | 'courier' | 'account'>('home');
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [readError, setReadError] = useState(false);
  const [onboardingError, setOnboardingError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState(false);
  const [taskScope, setTaskScope] = useState('personal');
  const [taskView, setTaskView] = useState<TaskView>('backlog');
  const [selectedDate, setSelectedDate] = useState(() => limaDate(new Date()));
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('medium');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskPriority, setEditingTaskPriority] = useState<TaskPriority>('medium');
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
      client.from('spaces').select('id,owner_id,state').maybeSingle(),
      client.from('tasks').select('id,space_id,title,completed,priority,due_on,requirements,created_at'),
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
    const avatarTimer = window.setTimeout(() => { void refreshAvatar().catch(() => setAvatarReadError(true)); }, 0);
    window.addEventListener('focus', update);
    const timer = window.setInterval(() => { if (!document.hidden) update(); }, 5000);
    return () => {
      invalidate();
      window.clearTimeout(avatarTimer);
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
    const dueOn = String(data.get('due_on') ?? '');
    const requirements = String(data.get('requirements') ?? '').trim();
    void act(async () => {
      const { error } = await client.from('tasks').insert({
        title, owner_id: userId, space_id: data.get('scope') === 'home' ? space?.id : null,
        priority: data.get('priority'), due_on: dueOn || null, requirements: requirements || null,
      });
      if (error) throw error;
      form.reset();
      setTaskScope('personal');
      setNewTaskPriority('medium');
    });
  }

  function updateTaskDetails(event: FormEvent<HTMLFormElement>, taskId: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const requirements = String(data.get('requirements') ?? '').trim();
    void act(async () => {
      const { data: updated, error } = await client.from('tasks').update({
        priority: data.get('priority'), due_on: String(data.get('due_on') ?? '') || null,
        requirements: requirements || null,
      }).eq('id', taskId).select('id').maybeSingle();
      if (error || !updated) throw error ?? new Error('Task unavailable');
      setEditingTaskId(null);
    });
  }

  const hasHome = space?.state === 'paired' || space?.state === 'retained' || space?.state === 'separated';
  const canEditHome = hasHome && space.state !== 'separated';
  const canEditCoupleProfile = Boolean(space && space.state !== 'separated');
  const homeTasks = tasks.filter((task) => task.space_id === space?.id);
  const completed = homeTasks.filter((task) => task.completed).length;
  const priorityOrder: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
  const orderedTasks = [...tasks].sort((a, b) => Number(a.completed) - Number(b.completed)
    || priorityOrder[a.priority] - priorityOrder[b.priority]
    || (a.due_on ?? '9999-12-31').localeCompare(b.due_on ?? '9999-12-31')
    || b.created_at.localeCompare(a.created_at));
  const today = limaDate(new Date());
  const tomorrow = followingDate(today);
  const visibleTasks = orderedTasks.filter((task) => {
    if (taskView === 'backlog') return true;
    if (task.completed || !task.due_on) return false;
    if (taskView === 'today') return task.due_on <= today;
    return task.due_on === (taskView === 'tomorrow' ? tomorrow : selectedDate);
  });
  const todayCount = tasks.filter((task) => !task.completed && task.due_on && task.due_on <= today).length;
  const tomorrowCount = tasks.filter((task) => !task.completed && task.due_on === tomorrow).length;

  return (
    <>
      <nav aria-label="Vistas" className="tabs">
        <button aria-pressed={tab === 'home'} onClick={() => setTab('home')}>Casa</button>
        <button aria-pressed={tab === 'tasks'} onClick={() => setTab('tasks')}>Tareas</button>
        <button aria-pressed={tab === 'expenses'} onClick={() => setTab('expenses')}>Gastos</button>
        <button aria-pressed={tab === 'courier'} onClick={() => setTab('courier')}>Reparto</button>
        <button aria-pressed={tab === 'account'} onClick={() => setTab('account')}>Mi cuenta</button>
      </nav>
      <div className="calendar-panel" hidden={tab !== 'tasks' || !loaded || readError}>
        <GoogleCalendar userId={userId} tasks={tasks} />
      </div>
      {message && <p role="status" className="notice">{message}</p>}
      {readError && <p role="status" className="notice">No se pudieron actualizar los datos. Comprueba tu conexión.</p>}
      {avatarReadError && <p role="status" className="notice">No se pudo cargar la personalización del avatar. Comprueba si está aplicada la migración de avatares.</p>}
      {tab === 'account' ? <AccountSettings client={client} email={email} />
        : !loaded || readError ? (!readError && <p role="status">Cargando tu espacio…</p>) : tab === 'home' ? (
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
                client={client} spaceId={space.id} userId={userId} ownerId={space.owner_id} paired={space.state === 'paired'}
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
      ) : tab === 'tasks' ? (
        <section className="panel">
          <h1>Tareas</h1>
          <nav className="task-views" aria-label="Vistas de tareas">
            <button type="button" className="secondary" aria-pressed={taskView === 'backlog'} onClick={() => setTaskView('backlog')}>Backlog</button>
            <button type="button" className="secondary" aria-pressed={taskView === 'today'} onClick={() => setTaskView('today')}>Hoy <span aria-hidden="true">{todayCount}</span></button>
            <button type="button" className="secondary" aria-pressed={taskView === 'tomorrow'} onClick={() => setTaskView('tomorrow')}>Mañana <span aria-hidden="true">{tomorrowCount}</span></button>
            <button type="button" className="secondary" aria-pressed={taskView === 'date'} onClick={() => setTaskView('date')}>Otra fecha</button>
          </nav>
          {taskView === 'date' && <label className="task-date-picker">Ver tareas del día
            <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.currentTarget.value)} />
          </label>}
          {taskView === 'today' && <p>Incluye tareas pendientes de días anteriores.</p>}
          <form className="task-form" onSubmit={addTask}>
            <label>Nueva tarea<input name="title" maxLength={160} required placeholder="¿Qué hay que hacer?" /></label>
            <PixelSelect label="Prioridad" name="priority" value={newTaskPriority} options={taskPriorityOptions}
              onValueChange={(value) => setNewTaskPriority(value as TaskPriority)} />
            <label>Fecha límite<input type="date" name="due_on" key={`${taskView}-${selectedDate}`}
              defaultValue={taskView === 'today' ? today : taskView === 'tomorrow' ? tomorrow : taskView === 'date' ? selectedDate : ''} /></label>
            <PixelSelect label="Visibilidad" name="scope" onValueChange={setTaskScope}
              options={canEditHome ? [taskVisibilityOptions[0], {
                value: 'home', label: space.state === 'retained' ? 'Casa conservada' : 'Compartida',
              }] : [taskVisibilityOptions[0]]}
              value={canEditHome && taskScope === 'home' ? 'home' : 'personal'} />
            <label className="task-requirements">Qué hace falta para terminarla<textarea name="requirements" maxLength={500}
              placeholder="Materiales, pasos o ayuda que necesitas" rows={2} /></label>
            <button disabled={busy}>Añadir</button>
          </form>
          {visibleTasks.length === 0 ? <p>{taskView === 'backlog' ? 'Aún no hay tareas.' : 'No hay tareas pendientes para esta fecha.'}</p> : (
            <ul className="tasks">
              {visibleTasks.map((task) => <li key={task.id} className={task.completed ? 'task-completed' : undefined}>
                <label><input type="checkbox" checked={task.completed} disabled={busy || (task.space_id !== null && !canEditHome)}
                  onChange={(event) => {
                    const done = event.currentTarget.checked;
                    void act(async () => {
                      const { data, error } = await client.from('tasks').update({ completed: done }).eq('id', task.id).select('id').maybeSingle();
                      if (error || !data) throw error ?? new Error('Task unavailable');
                    });
                  }} /><span>{task.title}</span></label>
                <div className="task-meta">
                  <span className={`task-priority priority-${task.priority}`}>Prioridad {task.priority === 'high' ? 'alta' : task.priority === 'low' ? 'baja' : 'normal'}</span>
                  <small>{task.space_id ? 'Casa' : 'Personal'}</small>
                  {!task.completed && task.due_on && task.due_on < today && <strong className="task-overdue">Atrasada</strong>}
                  {task.due_on && <time dateTime={task.due_on}>Para {new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${task.due_on}T00:00:00Z`))}</time>}
                  {task.requirements && <p>{task.requirements}</p>}
                </div>
                <button type="button" className="text-button" disabled={busy || (task.space_id !== null && !canEditHome)}
                  aria-expanded={editingTaskId === task.id} onClick={() => {
                    if (editingTaskId === task.id) setEditingTaskId(null);
                    else {
                      setEditingTaskId(task.id);
                      setEditingTaskPriority(task.priority);
                    }
                  }}>
                  {editingTaskId === task.id ? 'Cerrar edición' : 'Editar detalles'}
                </button>
                {editingTaskId === task.id && <form className="task-edit-form" onSubmit={(event) => updateTaskDetails(event, task.id)}>
                  <PixelSelect label="Prioridad" name="priority" value={editingTaskPriority} options={taskPriorityOptions}
                    onValueChange={(value) => setEditingTaskPriority(value as TaskPriority)} />
                  <label>Fecha límite<input type="date" name="due_on" defaultValue={task.due_on ?? ''} /></label>
                  <label className="task-requirements">Qué hace falta<textarea name="requirements" maxLength={500}
                    defaultValue={task.requirements ?? ''} rows={2} /></label>
                  <button disabled={busy}>Guardar detalles</button>
                </form>}
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
      ) : tab === 'expenses' ? (
        <Expenses client={client} userId={userId} spaceId={space?.id ?? null} canEditHome={canEditHome} />
      ) : (
        <CourierWork client={client} userId={userId} onRoleChange={refreshAvatar} />
      )}
    </>
  );
}

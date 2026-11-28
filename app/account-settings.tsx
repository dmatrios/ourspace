'use client';

import { useState, type FormEvent } from 'react';
import { connect } from '../lib/supabase';

type Client = NonNullable<ReturnType<typeof connect>>;

export default function AccountSettings({ client, email }: { client: Client; email: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const password = String(data.get('new_password') ?? '');
    if (password !== data.get('confirmation')) { setMessage('Las contraseñas no coinciden.'); return; }
    setBusy(true); setMessage('');
    const { error } = await client.auth.updateUser({ password });
    setMessage(error ? 'No se pudo cambiar la contraseña. Comprueba los requisitos de Supabase.' : 'Contraseña actualizada.');
    if (!error) form.reset();
    setBusy(false);
  }

  async function deleteAccount() {
    if (confirmDelete !== 'BORRAR' || !window.confirm('¿Eliminar definitivamente tu cuenta y tus datos personales?')) return;
    setBusy(true); setMessage('');
    const { data, error } = await client.rpc('delete_own_account');
    if (error) setMessage('No se pudo eliminar la cuenta. Inténtalo de nuevo.');
    else if (data === 'resolve_home_first') setMessage('Primero resuelve tu casa compartida. Debes salir o decidir qué hacer con sus datos antes de borrar la cuenta.');
    else if (data === 'shared_expenses') setMessage('Hay gastos compartidos vinculados a tu cuenta. La casa debe resolverlos antes de borrar tu usuario.');
    else if (data === 'deleted') { await client.auth.signOut(); setMessage('Cuenta eliminada.'); }
    else setMessage('No se pudo completar la eliminación.');
    setBusy(false);
  }

  return <section className="panel courier-section">
    <h1>Mi cuenta</h1>
    <p>Sesión de {email}. Estos ajustes corresponden únicamente a tu cuenta.</p>
    {message && <p role="status" className="notice">{message}</p>}
    <h2>Cambiar contraseña</h2>
    <form className="courier-form" onSubmit={changePassword}>
      <label>Nueva contraseña<input name="new_password" type="password" minLength={8} autoComplete="new-password" required /></label>
      <label>Confirmar contraseña<input name="confirmation" type="password" minLength={8} autoComplete="new-password" required /></label>
      <button disabled={busy}>Guardar contraseña</button>
    </form>
    <h2>Instalar Our Space</h2>
    <p>En Chrome o Edge, abre el menú del navegador y elige «Instalar aplicación» o «Añadir a pantalla de inicio». En iPhone, usa Compartir → Añadir a pantalla de inicio. Las pantallas privadas necesitan conexión.</p>
    <h2>Eliminar mi cuenta</h2>
    <p>Se eliminan tus datos personales de reparto y tus tareas privadas. Si existe una casa compartida, primero resuelve su estado y sus gastos.</p>
    <label>Escribe BORRAR para confirmar<input value={confirmDelete} onChange={(event) => setConfirmDelete(event.target.value)} autoComplete="off" /></label>
    <button type="button" className="danger" disabled={busy || confirmDelete !== 'BORRAR'} onClick={() => void deleteAccount()}>Eliminar mi cuenta</button>
  </section>;
}

'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import PixelSelect from './pixel-select';
import CourierFinance from './courier-finance';
import CourierReports from './courier-reports';
import CourierPartnerLog from './courier-partner-log';
import { connect } from '../lib/supabase';
import { allRows } from '../lib/supabase-pages';

type Client = NonNullable<ReturnType<typeof connect>>;
type Account = { user_id: string; enabled: boolean; allow_partner_logging: boolean; display_name: string | null; earning_mode: 'daily' | 'shift'; weekly_goal: string | null };
type Platform = { id: string; name: string; active: boolean; cash_limit: string | null };
type Vehicle = { name: string; odometer_km: string | null };
type Shift = { id: string; platform_id: string; status: 'active' | 'paused' | 'completed'; started_at: string; ended_at: string | null;
  odometer_start: string | null; odometer_end: string | null; opening_cash: string; cash_counted: string | null };
type Pause = { id: string; shift_id: string; started_at: string; ended_at: string | null;
  odometer_pause: string | null; odometer_resume: string | null };
type ShiftSummary = { gross: number; receipts: number; cashReceipts: number; cashSpent: number; expenses: number; fuel: number };
const currency = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
const dateTime = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' });

function money(value: string | number | null) { return currency.format(Number(value ?? 0)); }
function cents(value: string | number | null) {
  const [whole, fraction = ''] = String(value ?? 0).split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
}
function localDateTime(value: string) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)).replace(' ', 'T').slice(0, 16);
}

export default function CourierWork({ client, userId, paired, onRoleChange }: {
  client: Client; userId: string; paired: boolean; onRoleChange: () => Promise<void>;
}) {
  const [account, setAccount] = useState<Account | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [pauses, setPauses] = useState<Pause[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [section, setSection] = useState<'jornadas' | 'finanzas' | 'reportes' | 'ajustes'>('jornadas');
  const [startPlatform, setStartPlatform] = useState('');
  const [earningMode, setEarningMode] = useState('daily');
  const [pauseOdometer, setPauseOdometer] = useState('');
  const [summaryId, setSummaryId] = useState<string | null>(null);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [summaryReload, setSummaryReload] = useState(0);

  const refresh = useCallback(async () => {
    const [profile, available, transport, history, breaks] = await Promise.all([
      client.from('courier_accounts').select('user_id,enabled,allow_partner_logging,display_name,earning_mode,weekly_goal').eq('user_id', userId).maybeSingle(),
      allRows<Platform>(client, 'courier_platforms', 'id,name,active,cash_limit'),
      client.from('courier_vehicles').select('name,odometer_km').eq('user_id', userId).maybeSingle(),
      allRows<Shift>(client, 'courier_shifts', 'id,platform_id,status,started_at,ended_at,odometer_start,odometer_end,opening_cash,cash_counted'),
      allRows<Pause>(client, 'courier_pauses', 'id,shift_id,started_at,ended_at,odometer_pause,odometer_resume'),
    ]);
    const error = profile.error ?? transport.error;
    if (error) throw error;
    setAccount(profile.data); setEarningMode(profile.data?.earning_mode ?? 'daily');
    setPlatforms(available.sort((a, b) => a.name.localeCompare(b.name))); setVehicle(transport.data);
    setShifts(history.sort((a, b) => b.started_at.localeCompare(a.started_at)));
    setPauses(breaks.sort((a, b) => b.started_at.localeCompare(a.started_at))); setLoaded(true);
  }, [client, userId]);

  useEffect(() => {
    const update = () => { void refresh().catch(() => { setLoaded(true); setMessage('No se pudo cargar el trabajo. Revisa la conexión y las migraciones.'); }); };
    const first = window.setTimeout(update, 0);
    const timer = window.setInterval(() => { if (!document.hidden) update(); }, 10000);
    window.addEventListener('focus', update);
    return () => { window.clearTimeout(first); window.clearInterval(timer); window.removeEventListener('focus', update); };
  }, [refresh]);

  useEffect(() => {
    if (!summaryId) return;
    let active = true;
    const load = async () => {
      const [earnings, receipts, expenses, fuel] = await Promise.all([
        client.from('courier_earnings').select('reported_amount,tips,bonuses,tips_included,bonuses_included').eq('shift_id', summaryId),
        client.from('courier_receipts').select('amount,payment_method').eq('shift_id', summaryId),
        client.from('courier_expenses').select('amount,payment_method').eq('shift_id', summaryId),
        client.from('courier_fuel').select('amount,payment_method').eq('shift_id', summaryId),
      ]);
      if (!active || earnings.error || receipts.error || expenses.error || fuel.error) return;
      const gross = (earnings.data ?? []).reduce((sum, item) => sum + cents(item.reported_amount) +
        (item.tips_included ? 0 : cents(item.tips)) + (item.bonuses_included ? 0 : cents(item.bonuses)), 0);
      const receiptTotal = (receipts.data ?? []).reduce((sum, item) => sum + cents(item.amount), 0);
      const cashReceipts = (receipts.data ?? []).filter((item) => item.payment_method === 'cash')
        .reduce((sum, item) => sum + cents(item.amount), 0);
      const cashSpent = [...(expenses.data ?? []), ...(fuel.data ?? [])].filter((item) => item.payment_method === 'cash')
        .reduce((sum, item) => sum + cents(item.amount), 0);
      setSummary({ gross, receipts: receiptTotal, cashReceipts, cashSpent,
        expenses: (expenses.data ?? []).reduce((sum, item) => sum + cents(item.amount), 0),
        fuel: (fuel.data ?? []).reduce((sum, item) => sum + cents(item.amount), 0) });
    };
    void load();
    return () => { active = false; };
  }, [client, summaryId, summaryReload]);

  async function act(operation: () => Promise<void>, success: string) {
    setBusy(true); setMessage('');
    try { await operation(); await refresh(); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar. Revisa los datos y la conexión.'); }
    finally { setBusy(false); }
  }

  async function setRole(enabled: boolean) {
    await act(async () => {
      const { error } = account
        ? await client.from('courier_accounts').update({ enabled, ...(enabled ? {} : { allow_partner_logging: false }) }).eq('user_id', userId)
        : await client.from('courier_accounts').insert({ user_id: userId, enabled });
      if (error) throw error;
      await onRoleChange();
    }, enabled ? 'Rol de repartidor activado. La skin de reparto está disponible en la casa.' : 'Rol desactivado. Tus datos de trabajo se conservan.');
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const weeklyGoal = String(form.get('weekly_goal') ?? '').trim();
    void act(async () => {
      const { error } = await client.from('courier_accounts').update({
        display_name: String(form.get('display_name') ?? '').trim() || null,
        earning_mode: form.get('earning_mode'), weekly_goal: weeklyGoal || null,
      }).eq('user_id', userId);
      if (error) throw error;
    }, 'Preferencias guardadas.');
  }

  function addPlatform(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    void act(async () => {
      const { error } = await client.from('courier_platforms').insert({ user_id: userId, name: String(data.get('name')).trim() });
      if (error) throw error; form.reset();
    }, 'Plataforma añadida.');
  }

  function startShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    void act(async () => {
      const { error } = await client.rpc('courier_start_shift', {
        p_platform_id: activePlatforms.find((item) => item.id === startPlatform)?.id ?? activePlatforms[0]?.id,
        p_odometer: String(data.get('odometer') ?? '') || null,
        p_opening_cash: String(data.get('opening_cash') ?? '') || 0,
      });
      if (error) throw error; form.reset();
    }, 'Jornada iniciada con la hora del servidor.');
  }

  const openShift = shifts.find((item) => item.status !== 'completed');
  const activePlatforms = platforms.filter((item) => item.active);

  return <section className="panel courier-panel">
    <h1>Trabajo de reparto</h1>
    <p>Tus jornadas, cobros y gastos de trabajo son privados. Si lo autorizas, tu pareja podrá registrar movimientos durante una jornada activa.</p>
    {message && <p role="status" className="notice">{message}</p>}
    {!loaded ? <p role="status">Cargando trabajo…</p> : <>
      <div className="courier-role-card">
        <div><strong>{account?.enabled ? 'Rol de repartidor activo' : '¿Repartes pedidos?'}</strong>
          <p>Activa este rol en tu cuenta para llevar el registro y desbloquear la skin de reparto.</p></div>
        <button type="button" className={account?.enabled ? 'secondary' : ''} disabled={busy}
          onClick={() => void setRole(!account?.enabled)}>{account?.enabled ? 'Desactivar rol' : 'Soy repartidor'}</button>
      </div>
      {account?.enabled && <>
        <nav className="courier-tabs" aria-label="Trabajo de reparto">
          {(['jornadas', 'finanzas', 'reportes', 'ajustes'] as const).map((name) =>
            <button key={name} type="button" className={section === name ? '' : 'secondary'}
              aria-pressed={section === name} onClick={() => setSection(name)}>
              {{ jornadas: 'Jornadas', finanzas: 'Cobros y gastos', reportes: 'Reportes', ajustes: 'Ajustes' }[name]}
            </button>)}
        </nav>
        {section === 'jornadas' && <div className="courier-section">
          <h2>Tu jornada</h2>
          {openShift ? <div className="courier-shift-active">
            <strong>{platforms.find((item) => item.id === openShift.platform_id)?.name ?? 'Plataforma'} · {openShift.status === 'paused' ? 'En pausa' : 'En curso'}</strong>
            <p>Comenzó {dateTime.format(new Date(openShift.started_at))} · Efectivo inicial {money(openShift.opening_cash)}</p>
            <button type="button" className="secondary" onClick={() => { setSummaryId(openShift.id); setSummary(null); setSummaryReload((count) => count + 1); }}>Ver caja actual</button>
            {summaryId === openShift.id && <div>
              {!summary ? <p>Cargando caja…</p> : <>
                <p>Caja esperada {money((cents(openShift.opening_cash) + summary.cashReceipts - summary.cashSpent) / 100)}</p>
                <p>Cobros en efectivo {money(summary.cashReceipts / 100)} · Pagos en efectivo {money(summary.cashSpent / 100)}</p>
                {platforms.find((item) => item.id === openShift.platform_id)?.cash_limit != null && <p>
                  Exceso sobre límite de plataforma: {money(Math.max(0, summary.cashReceipts -
                    cents(platforms.find((item) => item.id === openShift.platform_id)!.cash_limit)) / 100)}</p>}
              </>}
            </div>}
            <div className="courier-actions">
              <label>Odómetro al {openShift.status === 'paused' ? 'reanudar' : 'pausar'} {openShift.odometer_start != null ? '(obligatorio)' : '(sin odómetro inicial)'}
                <input type="number" min="0" step="0.1" value={pauseOdometer} disabled={openShift.odometer_start == null}
                  onChange={(event) => setPauseOdometer(event.target.value)} /></label>
              <button type="button" disabled={busy || Boolean(openShift.odometer_start != null && !pauseOdometer)} onClick={() => void act(async () => {
                const { error } = await client.rpc('courier_transition_shift', { p_shift_id: openShift.id,
                  p_action: openShift.status === 'paused' ? 'resume' : 'pause',
                  p_odometer: pauseOdometer || null }); if (error) throw error; setPauseOdometer('');
              }, openShift.status === 'paused' ? 'Jornada reanudada.' : 'Pausa iniciada.')}>{openShift.status === 'paused' ? 'Reanudar' : 'Pausar'}</button>
            </div>
            <form className="courier-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget);
              void act(async () => { const { error } = await client.rpc('courier_transition_shift', {
                p_shift_id: openShift.id, p_action: 'finish', p_odometer: String(data.get('odometer_end') ?? '') || null,
              }); if (error) throw error; setSummaryId(openShift.id); setSummary(null); setSummaryReload((count) => count + 1);
              }, 'Jornada terminada. Registra la ganancia y cuenta el efectivo.'); }}>
              <label>Odómetro final (km)<input type="number" name="odometer_end" min="0" step="0.1"
                required={openShift.odometer_start != null && openShift.status !== 'paused'} disabled={openShift.odometer_start == null} /></label>
              <button disabled={busy}>Finalizar jornada</button>
            </form>
          </div> : <form className="courier-form" onSubmit={startShift}>
            <PixelSelect label="Plataforma" name="platform" value={startPlatform || activePlatforms[0]?.id || ''}
              options={activePlatforms.map((item) => ({ value: item.id, label: item.name }))} onValueChange={setStartPlatform} />
            <label>Odómetro inicial (km)<input type="number" name="odometer" min="0" step="0.1" defaultValue={vehicle?.odometer_km ?? ''} /></label>
            <label>Efectivo inicial (PEN)<input type="number" name="opening_cash" min="0" step="0.01" defaultValue="0" /></label>
            <button disabled={busy || activePlatforms.length === 0}>Iniciar jornada</button>
          </form>}
          {activePlatforms.length === 0 && <p>Primero añade una plataforma en Ajustes.</p>}
          <h2>Historial de jornadas</h2>
          {shifts.length === 0 ? <p>Aún no tienes jornadas.</p> : <ul className="courier-list">{shifts.map((shift) => {
            const breaks = pauses.filter((item) => item.shift_id === shift.id);
            const pausedMs = breaks.reduce((sum, item) => sum +
              (new Date(item.ended_at ?? new Date()).getTime() - new Date(item.started_at).getTime()), 0);
            const workedHours = Math.max(0, (new Date(shift.ended_at ?? new Date()).getTime() - new Date(shift.started_at).getTime() - pausedMs) / 3600000);
            return <li key={shift.id}><strong>{platforms.find((item) => item.id === shift.platform_id)?.name ?? 'Plataforma'}</strong>
              <p>{dateTime.format(new Date(shift.started_at))} · {shift.status === 'completed' ? 'Finalizada' : shift.status === 'paused' ? 'Pausada' : 'Activa'}
                {' · '}{workedHours.toFixed(1)} h efectivas · {breaks.length} pausas
                {shift.odometer_start != null && shift.odometer_end != null ? ` · ${(Number(shift.odometer_end) - Number(shift.odometer_start)).toFixed(1)} km` : ''}</p>
              {breaks.length > 0 && <details><summary>Ver pausas</summary><ul>{breaks.map((item) => <li key={item.id}>
                {dateTime.format(new Date(item.started_at))} → {item.ended_at ? dateTime.format(new Date(item.ended_at)) : 'En curso'}
                {item.odometer_pause ? ` · Pausa ${item.odometer_pause} km` : ''}
                {item.odometer_resume ? ` · Reanudó ${item.odometer_resume} km` : ''}</li>)}</ul></details>}
              {shift.status === 'completed' && <>
                <button type="button" className="secondary" onClick={() => { setSummaryId(shift.id); setSummary(null); setSummaryReload((count) => count + 1); }}>Ver cierre</button>
                {summaryId === shift.id && <div className="courier-shift-active">
                  <strong>Resumen de cierre</strong>
                  {!summary ? <p>Cargando movimientos…</p> : <>
                    <p>Ganancia informada {money(summary.gross / 100)} · Cobros de clientes {money(summary.receipts / 100)} (se muestran aparte)</p>
                    <p>Gastos {money(summary.expenses / 100)} · Combustible {money(summary.fuel / 100)}</p>
                    <p>Caja esperada {money((cents(shift.opening_cash) + summary.cashReceipts - summary.cashSpent) / 100)}
                      {shift.cash_counted != null ? ` · Diferencia ${money((cents(shift.cash_counted) - cents(shift.opening_cash) - summary.cashReceipts + summary.cashSpent) / 100)}` : ''}</p>
                    {!summary.gross && <button type="button" onClick={() => setSection('finanzas')}>Registrar ganancia de esta jornada</button>}
                  </>}
                </div>}
                <form className="courier-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget);
                  void act(async () => { const { error } = await client.rpc('courier_count_cash', {
                    p_shift_id: shift.id, p_counted: data.get('cash_counted'),
                  }); if (error) throw error; setSummaryReload((count) => count + 1); }, 'Arqueo guardado.'); }}>
                  <label>Efectivo contado (PEN)<input type="number" name="cash_counted" min="0" step="0.01" defaultValue={shift.cash_counted ?? ''} required /></label>
                  <button disabled={busy}>Guardar arqueo</button>
                </form>
                <details><summary>Corregir horario</summary>
                  <form className="courier-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget);
                    if (!window.confirm('¿Confirmas la corrección de esta jornada?')) return;
                    void act(async () => { const { error } = await client.rpc('courier_correct_shift_time', {
                      p_shift_id: shift.id, p_started_at: new Date(`${data.get('started_at')}:00-05:00`).toISOString(),
                      p_ended_at: new Date(`${data.get('ended_at')}:00-05:00`).toISOString(),
                    }); if (error) throw error; }, 'Horario corregido.'); }}>
                    <label>Inicio<input type="datetime-local" name="started_at" defaultValue={localDateTime(shift.started_at)} required /></label>
                    <label>Final<input type="datetime-local" name="ended_at" defaultValue={localDateTime(shift.ended_at!)} required /></label>
                    <button disabled={busy}>Confirmar corrección</button>
                  </form></details>
              </>}
            </li>;
          })}</ul>}
        </div>}
        {section === 'finanzas' && <CourierFinance client={client} userId={userId} platforms={platforms} shifts={shifts}
          earningMode={account.earning_mode} onSaved={async () => { await refresh(); setSummaryReload((count) => count + 1); }} />}
        {section === 'reportes' && <CourierReports client={client} platforms={platforms} weeklyGoal={account.weekly_goal} />}
        {section === 'ajustes' && <div className="courier-section">
          <h2>Preferencias personales</h2>
          {paired && <div className="courier-role-card">
            <div><strong>Registro asistido por mi pareja</strong>
              <p>Podrá añadir cobros y gastos de trabajo a tu jornada activa. No podrá cerrarla ni cambiar tus ajustes o reportes. Puedes quitar el permiso cuando quieras.</p></div>
            <button type="button" className={account.allow_partner_logging ? 'secondary' : ''} disabled={busy}
              onClick={() => void act(async () => { const { error } = await client.from('courier_accounts')
                .update({ allow_partner_logging: !account.allow_partner_logging }).eq('user_id', userId);
                if (error) throw error;
              }, account.allow_partner_logging ? 'Permiso retirado.' : 'Tu pareja ya puede registrar movimientos durante tus jornadas.')}
            >{account.allow_partner_logging ? 'Quitar permiso' : 'Permitir registro'}</button>
          </div>}
          <form className="courier-form" onSubmit={saveProfile}>
            <label>Nombre en el trabajo<input name="display_name" maxLength={80} defaultValue={account.display_name ?? ''} /></label>
            <PixelSelect label="Registrar ingresos por" name="earning_mode" value={earningMode}
              options={[{ value: 'daily', label: 'Día' }, { value: 'shift', label: 'Jornada' }]} onValueChange={setEarningMode} />
            <label>Meta semanal (PEN)<input type="number" name="weekly_goal" min="0.01" step="0.01" defaultValue={account.weekly_goal ?? ''} /></label>
            <button disabled={busy}>Guardar preferencias</button>
          </form>
          <h2>Plataformas</h2>
          <form className="courier-form" onSubmit={addPlatform}>
            <label>Nombre de la plataforma<input name="name" maxLength={80} placeholder="Ej. PedidosYa" required /></label>
            <button disabled={busy}>Añadir plataforma</button>
          </form>
          {platforms.length === 0 ? <p>Aún no tienes plataformas.</p> : <ul className="courier-list">{platforms.map((item) => <li key={item.id}>
            <form className="courier-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget);
              void act(async () => { const { error } = await client.from('courier_platforms').update({
                name: String(data.get('name')).trim(), cash_limit: String(data.get('cash_limit') ?? '') || null,
                active: data.get('active') === 'on',
              }).eq('id', item.id); if (error) throw error; }, 'Plataforma actualizada.'); }}>
              <label>Nombre<input name="name" defaultValue={item.name} required /></label>
              <label>Límite de efectivo (PEN)<input type="number" name="cash_limit" min="0" step="0.01" defaultValue={item.cash_limit ?? ''} /></label>
              <label className="courier-check"><input type="checkbox" name="active" defaultChecked={item.active} /> Activa</label>
              <button disabled={busy}>Guardar</button>
            </form>
          </li>)}</ul>}
          <h2>Vehículo</h2>
          <form className="courier-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget);
            void act(async () => { const { error } = await client.from('courier_vehicles').upsert({ user_id: userId,
              name: String(data.get('name')).trim(), odometer_km: String(data.get('odometer_km') ?? '') || null,
            }); if (error) throw error; }, 'Vehículo guardado.'); }}>
            <label>Nombre<input name="name" maxLength={80} defaultValue={vehicle?.name ?? ''} placeholder="Moto, bici o auto" required /></label>
            <label>Odómetro actual (km)<input type="number" name="odometer_km" min="0" step="0.1" defaultValue={vehicle?.odometer_km ?? ''} /></label>
            <button disabled={busy}>Guardar vehículo</button>
          </form>
        </div>}
      </>}
      {paired && <CourierPartnerLog client={client} />}
    </>}
  </section>;
}

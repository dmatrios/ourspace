'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import PixelSelect from './pixel-select';
import { connect } from '../lib/supabase';
import { clearCourierDraft, readCourierDraft, saveCourierDraft } from '../lib/courier-draft';
import { allRows } from '../lib/supabase-pages';

type Client = NonNullable<ReturnType<typeof connect>>;
type Platform = { id: string; name: string; active: boolean };
type Shift = { id: string; platform_id: string; started_at: string; ended_at: string | null; status: string };
type Category = { id: string; name: string; kind: 'operational' | 'personal'; active: boolean };
type Earning = { id: string; platform_id: string; shift_id: string | null; earned_on: string; mode: 'daily' | 'shift';
  reported_amount: string; tips: string; bonuses: string; tips_included: boolean; bonuses_included: boolean; orders: number; notes: string; revision: number };
type Receipt = { id: string; platform_id: string; shift_id: string | null; amount: string; payment_method: string;
  cash_received: string | null; description: string; occurred_at: string };
type Expense = { id: string; category_id: string; shift_id: string | null; amount: string; description: string;
  occurred_at: string; payment_method: string | null; cash_paid: string | null; ruc: string | null; notes: string;
  recurring_id: string | null; due_date: string | null };
type Fuel = { id: string; shift_id: string | null; amount: string; liters: string | null; odometer_km: string | null;
  full_tank: boolean; occurred_at: string; payment_method: string | null; cash_paid: string | null; notes: string };
type Recurring = { id: string; category_id: string; description: string; amount: string; cadence: 'weekly' | 'monthly'; anchor_date: string; active: boolean };
type History = { id: number; earning_id: string; before_value: Earning; after_value: Earning; changed_at: string };
const currency = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
const dateTime = new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Lima' });
const methods = [{ value: 'cash', label: 'Efectivo' }, { value: 'yape', label: 'Yape' },
  { value: 'plin', label: 'Plin' }, { value: 'card', label: 'Tarjeta' }];
const asMoney = (value: string | number | null) => currency.format(Number(value ?? 0));
const cents = (value: string | number) => { const [whole, fraction = ''] = String(value).split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2)); };
const moneyInput = (value: FormDataEntryValue | null, optional = false) => {
  const raw = String(value ?? '').trim();
  if (optional && !raw) return null;
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(raw)) throw new Error('Escribe un importe válido con hasta dos decimales.');
  return raw;
};
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const paidDate = (value: string) => new Date(`${value}T12:00:00-05:00`).toISOString();
const limaDateTime = (value: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit',
  day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(value).replace(' ', 'T').slice(0, 16);
const fromLimaDateTime = (value: string) => {
  const date = new Date(`${value}:00-05:00`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
};
const shiftAt = (shift: Shift, occurredAt: string) => new Date(occurredAt).getTime() >= new Date(shift.started_at).getTime()
  && new Date(occurredAt).getTime() <= new Date(shift.ended_at ?? new Date()).getTime();

function nextDue(rule: Recurring, payments: Expense[]) {
  let date = new Date(`${rule.anchor_date}T12:00:00Z`);
  for (let count = 0; count < 1200; count++) {
    if (!payments.some((payment) => payment.recurring_id === rule.id && payment.due_date === date.toISOString().slice(0, 10)))
      return date.toISOString().slice(0, 10);
    if (rule.cadence === 'weekly') date.setUTCDate(date.getUTCDate() + 7);
    else {
      const anchorDay = Number(rule.anchor_date.slice(8));
      const year = date.getUTCFullYear(); const month = date.getUTCMonth() + 1;
      date = new Date(Date.UTC(year, month, Math.min(anchorDay, new Date(Date.UTC(year, month + 1, 0)).getUTCDate()), 12));
    }
  }
  return date.toISOString().slice(0, 10);
}

function ExpenseEditor({ item, categories, busy, onSave }: {
  item: Expense; categories: Category[]; busy: boolean;
  onSave: (values: FormData, categoryId: string, paymentMethod: string) => void;
}) {
  const [categoryId, setCategoryId] = useState(item.category_id);
  const [paymentMethod, setPaymentMethod] = useState(item.payment_method ?? 'cash');
  return <details><summary>Editar gasto</summary>
    <form className="courier-form" onSubmit={(event) => { event.preventDefault(); onSave(new FormData(event.currentTarget), categoryId, paymentMethod); }}>
      <label>Descripción<input name="description" defaultValue={item.description} maxLength={200} required /></label>
      <label>Importe (PEN)<input name="amount" type="number" min="0.01" step="0.01" defaultValue={item.amount} required /></label>
      <label>Fecha<input name="occurred_on" type="date" defaultValue={item.occurred_at.slice(0, 10)} required /></label>
      <PixelSelect label="Categoría" name="category" value={categoryId} options={categories.map((cat) => ({ value: cat.id, label: cat.name }))}
        onValueChange={setCategoryId} />
      <PixelSelect label="Método" name="method" value={paymentMethod} options={methods} onValueChange={setPaymentMethod} />
      {paymentMethod === 'cash' && <label>Efectivo entregado<input name="cash_paid" type="number" min="0" step="0.01" defaultValue={item.cash_paid ?? ''} /></label>}
      <label>RUC<input name="ruc" defaultValue={item.ruc ?? ''} maxLength={20} /></label>
      <label>Nota<input name="notes" defaultValue={item.notes} maxLength={500} /></label>
      <button disabled={busy}>Guardar edición</button>
    </form>
  </details>;
}

function ReceiptEditor({ item, shifts, busy, onSave }: {
  item: Receipt; shifts: Shift[]; busy: boolean;
  onSave: (values: FormData, method: string, shiftId: string) => void;
}) {
  const [method, setMethod] = useState(item.payment_method);
  const [shiftId, setShiftId] = useState(item.shift_id ?? '');
  return <details><summary>Editar cobro</summary>
    <form className="courier-form" onSubmit={(event) => { event.preventDefault(); onSave(new FormData(event.currentTarget), method, shiftId); }}>
      <label>Importe<input name="amount" type="number" min="0.01" step="0.01" defaultValue={item.amount} required /></label>
      <PixelSelect label="Método" name="method" value={method} options={methods} onValueChange={setMethod} />
      <PixelSelect label="Jornada" name="shift" value={shiftId} options={[{ value: '', label: 'Sin jornada' },
        ...shifts.filter((shift) => shift.platform_id === item.platform_id && shiftAt(shift, item.occurred_at))
          .map((shift) => ({ value: shift.id, label: dateTime.format(new Date(shift.started_at)) }))]}
        onValueChange={setShiftId} />
      <label>Fecha y hora<input name="occurred_at" type="datetime-local" defaultValue={limaDateTime(new Date(item.occurred_at))} required /></label>
      {method === 'cash' && <label>Efectivo recibido<input name="cash_received" type="number" min="0" step="0.01" defaultValue={item.cash_received ?? ''} /></label>}
      <label>Detalle<input name="description" maxLength={200} defaultValue={item.description} /></label>
      <button disabled={busy}>Guardar edición</button>
    </form>
  </details>;
}

function FuelEditor({ item, busy, onSave }: { item: Fuel; busy: boolean; onSave: (values: FormData, method: string) => void }) {
  const [method, setMethod] = useState(item.payment_method ?? 'cash');
  return <details><summary>Editar recarga</summary>
    <form className="courier-form" onSubmit={(event) => { event.preventDefault(); onSave(new FormData(event.currentTarget), method); }}>
      <label>Importe<input name="amount" type="number" min="0.01" step="0.01" defaultValue={item.amount} required /></label>
      <label>Litros<input name="liters" type="number" min="0.001" step="0.001" defaultValue={item.liters ?? ''} /></label>
      <label>Odómetro<input name="odometer_km" type="number" min="0" step="0.1" defaultValue={item.odometer_km ?? ''} /></label>
      <PixelSelect label="Método" name="method" value={method} options={methods} onValueChange={setMethod} />
      {method === 'cash' && <label>Efectivo entregado<input name="cash_paid" type="number" min="0" step="0.01" defaultValue={item.cash_paid ?? ''} /></label>}
      <label className="courier-check"><input type="checkbox" name="full_tank" defaultChecked={item.full_tank} /> Tanque lleno</label>
      <label>Notas<input name="notes" defaultValue={item.notes} maxLength={500} /></label>
      <button disabled={busy}>Guardar edición</button>
    </form>
  </details>;
}

function CategoryRemoval({ item, categories, busy, onRemove }: {
  item: Category; categories: Category[]; busy: boolean; onRemove: (replacement: string | null) => void;
}) {
  const [replacement, setReplacement] = useState('');
  const alternatives = categories.filter((candidate) => candidate.id !== item.id && candidate.kind === item.kind);
  return <details><summary>Eliminar categoría</summary>
    <p>Si ya tiene gastos o reglas, elige otra categoría del mismo tipo para conservarlos.</p>
    <PixelSelect label="Reasignar registros a" name={`category-replace-${item.id}`} value={replacement}
      options={[{ value: '', label: 'No reasignar' }, ...alternatives.map((candidate) => ({ value: candidate.id, label: candidate.name }))]}
      onValueChange={setReplacement} />
    <button type="button" className="danger" disabled={busy} onClick={() => {
      if (window.confirm(`¿Eliminar la categoría ${item.name}?`)) onRemove(replacement || null);
    }}>Eliminar categoría</button>
  </details>;
}

export default function CourierFinance({ client, userId, platforms, shifts, earningMode, onSaved }: {
  client: Client; userId: string; platforms: Platform[]; shifts: Shift[]; earningMode: 'daily' | 'shift'; onSaved: () => Promise<void>;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [fuel, setFuel] = useState<Fuel[]>([]);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const [receiptDraft] = useState(() => readCourierDraft(userId, 'receipt'));
  const [expenseDraft] = useState(() => readCourierDraft(userId, 'expense'));
  const receiptForm = useRef<HTMLFormElement>(null);
  const expenseForm = useRef<HTMLFormElement>(null);
  const [section, setSection] = useState<'earnings' | 'receipts' | 'expenses' | 'fuel'>('earnings');
  const [platformId, setPlatformId] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [receiptPlatformId, setReceiptPlatformId] = useState(receiptDraft?.platform ?? '');
  const [receiptShiftId, setReceiptShiftId] = useState(receiptDraft?.shift ?? '');
  const [receiptMethod, setReceiptMethod] = useState(receiptDraft?.method ?? 'cash');
  const [receiptAt, setReceiptAt] = useState(receiptDraft?.occurred_at ?? limaDateTime(new Date()));
  const [expenseCategoryId, setExpenseCategoryId] = useState(expenseDraft?.category ?? '');
  const [expenseShiftId, setExpenseShiftId] = useState(expenseDraft?.shift ?? '');
  const [expenseMethod, setExpenseMethod] = useState(expenseDraft?.method ?? 'cash');
  const [fuelShiftId, setFuelShiftId] = useState('');
  const [fuelMethod, setFuelMethod] = useState('cash');
  const [categoryKind, setCategoryKind] = useState('operational');
  const [recurringCategoryId, setRecurringCategoryId] = useState('');
  const [recurringCadence, setRecurringCadence] = useState('monthly');

  const refresh = useCallback(async () => {
    const [categoriesList, earningsList, receiptsList, expensesList, fuelList, recurringList, historyList] = await Promise.all([
      allRows<Category>(client, 'courier_categories', 'id,name,kind,active'),
      allRows<Earning>(client, 'courier_earnings', 'id,platform_id,shift_id,earned_on,mode,reported_amount,tips,bonuses,tips_included,bonuses_included,orders,notes,revision'),
      allRows<Receipt>(client, 'courier_receipts', 'id,platform_id,shift_id,amount,payment_method,cash_received,description,occurred_at'),
      allRows<Expense>(client, 'courier_expenses', 'id,category_id,shift_id,amount,description,occurred_at,payment_method,cash_paid,ruc,notes,recurring_id,due_date'),
      allRows<Fuel>(client, 'courier_fuel', 'id,shift_id,amount,liters,odometer_km,full_tank,occurred_at,payment_method,cash_paid,notes'),
      allRows<Recurring>(client, 'courier_recurring', 'id,category_id,description,amount,cadence,anchor_date,active'),
      allRows<History>(client, 'courier_earnings_history', 'id,earning_id,before_value,after_value,changed_at'),
    ]);
    setCategories(categoriesList.sort((a, b) => a.name.localeCompare(b.name)));
    setEarnings(earningsList.sort((a, b) => b.earned_on.localeCompare(a.earned_on)));
    setReceipts(receiptsList.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)));
    setExpenses(expensesList.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)));
    setFuel(fuelList.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)));
    setRecurring(recurringList.sort((a, b) => a.anchor_date.localeCompare(b.anchor_date)));
    setHistory(historyList.sort((a, b) => b.changed_at.localeCompare(a.changed_at))); setLoaded(true);
  }, [client]);

  useEffect(() => {
    const update = () => { void refresh().catch(() => { setLoaded(true); setMessage('No se pudieron cargar los movimientos.'); }); };
    const timer = window.setTimeout(update, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function act(operation: () => Promise<void>, success: string) {
    setBusy(true); setMessage('');
    try { await operation(); await Promise.all([refresh(), onSaved()]); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar. Comprueba los datos.'); }
    finally { setBusy(false); }
  }

  function addEarning(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const selectedShift = shifts.find((item) => item.id === shiftId);
    const selectedPlatform = (selectedShift?.platform_id ?? platformId) || platforms[0]?.id;
    if (!selectedPlatform || (earningMode === 'shift' && !selectedShift)) { setMessage('Elige plataforma o jornada.'); return; }
    void act(async () => {
      const { error } = await client.from('courier_earnings').insert({
        user_id: userId, platform_id: selectedPlatform, shift_id: earningMode === 'shift' ? selectedShift?.id : null,
        mode: earningMode, earned_on: earningMode === 'shift' ? new Date(selectedShift!.started_at).toISOString().slice(0, 10) : data.get('earned_on'),
        reported_amount: moneyInput(data.get('reported_amount')), tips: moneyInput(data.get('tips')),
        bonuses: moneyInput(data.get('bonuses')), tips_included: data.get('tips_included') === 'on',
        bonuses_included: data.get('bonuses_included') === 'on', orders: Number(data.get('orders') ?? 0), notes: String(data.get('notes') ?? ''),
      }); if (error) throw error; form.reset();
    }, 'Ganancia registrada. Los cobros de pedidos no se suman dos veces.');
  }

  const earningGross = (item: Earning) => cents(item.reported_amount) +
    (item.tips_included ? 0 : cents(item.tips)) + (item.bonuses_included ? 0 : cents(item.bonuses));
  const activeCategories = categories.filter((item) => item.active);
  const shiftOptions = [{ value: '', label: 'Sin jornada' }, ...shifts.map((item) => ({ value: item.id,
    label: `${platforms.find((platform) => platform.id === item.platform_id)?.name ?? 'Plataforma'} · ${dateTime.format(new Date(item.started_at))}` }))];

  return <div className="courier-section">
    <nav className="courier-tabs" aria-label="Movimientos de reparto">
      {(['earnings', 'receipts', 'expenses', 'fuel'] as const).map((name) => <button key={name} type="button"
        className={section === name ? '' : 'secondary'} aria-pressed={section === name} onClick={() => setSection(name)}>
        {{ earnings: 'Ganancias', receipts: 'Cobros', expenses: 'Gastos', fuel: 'Combustible' }[name]}</button>)}
    </nav>
    {message && <p role="status" className="notice">{message}</p>}
    {!loaded ? <p>Cargando movimientos…</p> : section === 'earnings' ? <>
      <h2>Ganancias de plataforma</h2>
      <p>Registra el importe que informa la plataforma. Propinas y bonos sólo se agregan al bruto cuando no están incluidos.</p>
      <form className="courier-form" onSubmit={addEarning}>
        {earningMode === 'daily' ? <>
          <PixelSelect label="Plataforma" name="platform" value={platformId || platforms[0]?.id || ''}
            options={platforms.map((item) => ({ value: item.id, label: item.name }))} onValueChange={setPlatformId} />
          <label>Fecha<input type="date" name="earned_on" defaultValue={today()} required /></label>
        </> : <PixelSelect label="Jornada" name="shift" value={shiftId} options={shifts.map((item) => ({ value: item.id,
          label: `${platforms.find((p) => p.id === item.platform_id)?.name} · ${dateTime.format(new Date(item.started_at))}` }))}
          onValueChange={setShiftId} />}
        <label>Importe informado (PEN)<input type="number" name="reported_amount" min="0" step="0.01" required /></label>
        <label>Propinas (PEN)<input type="number" name="tips" min="0" step="0.01" defaultValue="0" required /></label>
        <label>Bonos (PEN)<input type="number" name="bonuses" min="0" step="0.01" defaultValue="0" required /></label>
        <label>Pedidos<input type="number" name="orders" min="0" step="1" defaultValue="0" required /></label>
        <label>Notas<input name="notes" maxLength={500} /></label>
        <label className="courier-check"><input type="checkbox" name="tips_included" /> Propinas incluidas</label>
        <label className="courier-check"><input type="checkbox" name="bonuses_included" /> Bonos incluidos</label>
        <button disabled={busy || platforms.length === 0}>Guardar ganancia</button>
      </form>
      {earnings.length === 0 ? <p>Aún no registraste ganancias.</p> : <ul className="courier-list">{earnings.map((item) => <li key={item.id}>
        <strong>{platforms.find((platform) => platform.id === item.platform_id)?.name} · {item.earned_on} · {asMoney(earningGross(item) / 100)}</strong>
        <p>Informado {asMoney(item.reported_amount)} · Propinas {asMoney(item.tips)} · Bonos {asMoney(item.bonuses)} · {item.orders} pedidos</p>
        {history.some((change) => change.earning_id === item.id) && <details><summary>Historial de cambios</summary><ul>
          {history.filter((change) => change.earning_id === item.id).map((change) => <li key={change.id}>
            {dateTime.format(new Date(change.changed_at))}: {asMoney(change.before_value.reported_amount)} → {asMoney(change.after_value.reported_amount)}
          </li>)}</ul></details>}
        <details><summary>Editar ganancia</summary><form className="courier-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget);
          void act(async () => { const { data: updated, error } = await client.from('courier_earnings').update({
            reported_amount: moneyInput(data.get('reported_amount')), tips: moneyInput(data.get('tips')),
            bonuses: moneyInput(data.get('bonuses')), orders: Number(data.get('orders')), notes: String(data.get('notes') ?? ''),
            tips_included: data.get('tips_included') === 'on', bonuses_included: data.get('bonuses_included') === 'on',
            revision: item.revision + 1,
          }).eq('id', item.id).eq('revision', item.revision).select('id').maybeSingle();
          if (error || !updated) throw error ?? new Error('Este ingreso cambió. Recarga antes de editarlo.');
          }, 'Ganancia actualizada e historial guardado.'); }}>
          <label>Importe informado<input name="reported_amount" type="number" min="0" step="0.01" defaultValue={item.reported_amount} required /></label>
          <label>Propinas<input name="tips" type="number" min="0" step="0.01" defaultValue={item.tips} required /></label>
          <label>Bonos<input name="bonuses" type="number" min="0" step="0.01" defaultValue={item.bonuses} required /></label>
          <label>Pedidos<input name="orders" type="number" min="0" step="1" defaultValue={item.orders} required /></label>
          <label>Notas<input name="notes" defaultValue={item.notes} /></label>
          <label className="courier-check"><input name="tips_included" type="checkbox" defaultChecked={item.tips_included} /> Propinas incluidas</label>
          <label className="courier-check"><input name="bonuses_included" type="checkbox" defaultChecked={item.bonuses_included} /> Bonos incluidos</label>
          <button disabled={busy}>Guardar edición</button>
        </form></details>
      </li>)}</ul>}
    </> : section === 'receipts' ? <>
      <h2>Cobros de pedidos</h2><p>Son dinero recibido del cliente; no aumentan la ganancia informada por la plataforma.</p>
      <form ref={receiptForm} className="courier-form" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
        const selectedPlatform = receiptPlatformId || platforms[0]?.id; if (!selectedPlatform) return;
        void act(async () => { const { error } = await client.from('courier_receipts').insert({ user_id: userId,
          platform_id: selectedPlatform, shift_id: receiptShiftId || null, amount: moneyInput(data.get('amount')),
          occurred_at: fromLimaDateTime(String(data.get('occurred_at'))), payment_method: receiptMethod,
          cash_received: receiptMethod === 'cash' ? moneyInput(data.get('cash_received'), true) : null,
          description: String(data.get('description') ?? '').trim(),
        }); if (error) throw error; form.reset(); setReceiptAt(limaDateTime(new Date())); setReceiptShiftId('');
          clearCourierDraft(userId, 'receipt'); }, 'Cobro registrado.'); }}>
        <PixelSelect label="Plataforma" name="platform" value={receiptPlatformId || platforms[0]?.id || ''}
          options={platforms.map((item) => ({ value: item.id, label: item.name }))} onValueChange={(value) => { setReceiptPlatformId(value); setReceiptShiftId(''); }} />
        <PixelSelect label="Jornada" name="shift" value={receiptShiftId} options={shiftOptions.filter((item) => !item.value || shifts.some((s) =>
          s.id === item.value && s.platform_id === (receiptPlatformId || platforms[0]?.id) && shiftAt(s, fromLimaDateTime(receiptAt))))}
          onValueChange={setReceiptShiftId} />
        <label>Fecha y hora del cobro<input name="occurred_at" type="datetime-local" value={receiptAt}
          onChange={(event) => { setReceiptAt(event.target.value); setReceiptShiftId(''); }} required /></label>
        <label>Importe (PEN)<input name="amount" type="number" min="0.01" step="0.01" defaultValue={receiptDraft?.amount ?? ''} required /></label>
        <PixelSelect label="Método" name="method" value={receiptMethod} options={methods} onValueChange={setReceiptMethod} />
        {receiptMethod === 'cash' && <label>Efectivo recibido (para calcular vuelto)<input name="cash_received" type="number" min="0" step="0.01" defaultValue={receiptDraft?.cash_received ?? ''} /></label>}
        <label>Detalle<input name="description" maxLength={200} defaultValue={receiptDraft?.description ?? ''} /></label>
        <button disabled={busy || platforms.length === 0}>Registrar cobro</button>
        <button type="button" className="secondary" onClick={() => { if (receiptForm.current) { saveCourierDraft(userId, 'receipt', receiptForm.current); setMessage('Borrador del cobro guardado en este navegador por 7 días.'); } }}>Guardar borrador</button>
      </form>
      {receipts.length === 0 ? <p>Aún no hay cobros.</p> : <ul className="courier-list">{receipts.map((item) => <li key={item.id}>
        <strong>{asMoney(item.amount)} · {methods.find((method) => method.value === item.payment_method)?.label}</strong>
        <p>{dateTime.format(new Date(item.occurred_at))} · {platforms.find((p) => p.id === item.platform_id)?.name} · {item.shift_id ? 'Vinculado a jornada' : 'Sin jornada'}
          {item.cash_received ? ` · Vuelto ${asMoney((cents(item.cash_received) - cents(item.amount)) / 100)}` : ''}</p>
        {!item.shift_id && <PixelSelect label="Asociar a jornada" name={`receipt-${item.id}`} value="" options={shiftOptions.filter((option) =>
          option.value && shifts.some((s) => s.id === option.value && s.platform_id === item.platform_id && shiftAt(s, item.occurred_at)))}
          onValueChange={(value) => void act(async () => {
          const { error } = await client.from('courier_receipts').update({ shift_id: value }).eq('id', item.id); if (error) throw error;
        }, 'Cobro asociado a la jornada.')} />}
        <ReceiptEditor item={item} shifts={shifts} busy={busy} onSave={(data, method, chosenShift) => void act(async () => {
          const { error } = await client.from('courier_receipts').update({ amount: moneyInput(data.get('amount')),
            payment_method: method, shift_id: chosenShift || null,
            occurred_at: fromLimaDateTime(String(data.get('occurred_at'))),
            cash_received: method === 'cash' ? moneyInput(data.get('cash_received'), true) : null,
            description: String(data.get('description') ?? '').trim(),
          }).eq('id', item.id); if (error) throw error;
        }, 'Cobro actualizado.')} />
      </li>)}</ul>}
    </> : section === 'expenses' ? <>
      <h2>Gastos de trabajo y personales</h2>
      <form className="courier-form" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
        void act(async () => { const { error } = await client.from('courier_categories').insert({
          user_id: userId, name: String(data.get('name')).trim(), kind: categoryKind,
        }); if (error) throw error; form.reset(); }, 'Categoría creada.'); }}>
        <label>Nueva categoría<input name="name" maxLength={80} required /></label>
        <PixelSelect label="Tipo" name="kind" value={categoryKind}
          options={[{ value: 'operational', label: 'Operativa' }, { value: 'personal', label: 'Personal' }]} onValueChange={setCategoryKind} />
        <button disabled={busy}>Añadir categoría</button>
      </form>
      {categories.length > 0 && <ul className="courier-chips">{categories.map((item) => <li key={item.id}>
        {item.name} · {item.kind === 'operational' ? 'Trabajo' : 'Personal'}
        <button className="text-button" disabled={busy} onClick={() => void act(async () => { const { error } = await client.from('courier_categories')
          .update({ active: !item.active }).eq('id', item.id); if (error) throw error; }, 'Categoría actualizada.')}>
          {item.active ? 'Archivar' : 'Activar'}</button>
        <CategoryRemoval item={item} categories={categories} busy={busy} onRemove={(replacement) => void act(async () => {
          const { data, error } = await client.rpc('courier_remove_category', { p_category_id: item.id, p_replacement_id: replacement });
          if (error || data !== 'deleted') throw error ?? new Error(data === 'in_use'
            ? 'Tiene registros. Elige otra categoría para conservarlos.' : 'No se pudo eliminar la categoría.');
        }, 'Categoría eliminada y registros conservados.')} />
      </li>)}</ul>}
      <form ref={expenseForm} className="courier-form" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
        if (!expenseCategoryId && !activeCategories[0]) return;
        void act(async () => { const { error } = await client.from('courier_expenses').insert({ user_id: userId,
          category_id: expenseCategoryId || activeCategories[0].id, shift_id: expenseShiftId || null,
          description: String(data.get('description')).trim(), amount: moneyInput(data.get('amount')),
          occurred_at: paidDate(String(data.get('occurred_on'))), payment_method: expenseMethod,
          cash_paid: expenseMethod === 'cash' ? moneyInput(data.get('cash_paid'), true) : null,
          ruc: String(data.get('ruc') ?? '').trim() || null, notes: String(data.get('notes') ?? ''),
        }); if (error) throw error; form.reset(); clearCourierDraft(userId, 'expense'); }, 'Gasto registrado.'); }}>
        <label>Descripción<input name="description" maxLength={200} defaultValue={expenseDraft?.description ?? ''} required /></label>
        <label>Importe (PEN)<input name="amount" type="number" min="0.01" step="0.01" defaultValue={expenseDraft?.amount ?? ''} required /></label>
        <label>Fecha<input name="occurred_on" type="date" defaultValue={expenseDraft?.occurred_on ?? today()} required /></label>
        <PixelSelect label="Categoría" name="category" value={expenseCategoryId || activeCategories[0]?.id || ''}
          options={activeCategories.map((item) => ({ value: item.id, label: `${item.name} · ${item.kind === 'operational' ? 'Trabajo' : 'Personal'}` }))}
          onValueChange={setExpenseCategoryId} />
        <PixelSelect label="Jornada" name="shift" value={expenseShiftId} options={shiftOptions} onValueChange={setExpenseShiftId} />
        <PixelSelect label="Método de pago" name="method" value={expenseMethod} options={methods} onValueChange={setExpenseMethod} />
        {expenseMethod === 'cash' && <label>Efectivo entregado (opcional)<input name="cash_paid" type="number" min="0" step="0.01" defaultValue={expenseDraft?.cash_paid ?? ''} /></label>}
        <label>RUC (opcional)<input name="ruc" maxLength={20} defaultValue={expenseDraft?.ruc ?? ''} /></label>
        <label>Nota<input name="notes" maxLength={500} defaultValue={expenseDraft?.notes ?? ''} /></label>
        <button disabled={busy || activeCategories.length === 0}>Guardar gasto</button>
        <button type="button" className="secondary" onClick={() => { if (expenseForm.current) { saveCourierDraft(userId, 'expense', expenseForm.current); setMessage('Borrador del gasto guardado en este navegador por 7 días.'); } }}>Guardar borrador</button>
      </form>
      {expenses.length > 0 && <><h2>Gastos frecuentes</h2><div className="courier-chips">{Array.from(new Set(expenses.map((item) => item.description.toLowerCase())))
        .filter((name) => expenses.filter((item) => item.description.toLowerCase() === name).length >= 2).slice(0, 6)
        .map((name) => <button type="button" key={name} className="secondary" onClick={() => {
          const prior = expenses.find((item) => item.description.toLowerCase() === name);
          if (!prior || !expenseForm.current) return;
          const fields = expenseForm.current.elements;
          (fields.namedItem('description') as HTMLInputElement).value = prior.description;
          (fields.namedItem('amount') as HTMLInputElement).value = prior.amount;
          setExpenseCategoryId(prior.category_id); setExpenseMethod(prior.payment_method ?? 'cash');
          setMessage('Revisa el importe y confirma el nuevo gasto con Guardar gasto.');
        }}>{name} · usar como base</button>)}</div></>}
      <h2>Reglas recurrentes</h2>
      <form className="courier-form" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
        if (!recurringCategoryId && !activeCategories[0]) return;
        void act(async () => { const { error } = await client.from('courier_recurring').insert({ user_id: userId,
          category_id: recurringCategoryId || activeCategories[0].id, description: String(data.get('description')).trim(),
          amount: moneyInput(data.get('amount')), cadence: recurringCadence, anchor_date: data.get('anchor_date'),
        }); if (error) throw error; form.reset(); }, 'Regla creada. Cada pago necesita tu confirmación.'); }}>
        <label>Descripción<input name="description" maxLength={200} required /></label>
        <label>Importe (PEN)<input name="amount" type="number" min="0.01" step="0.01" required /></label>
        <label>Primera fecha<input name="anchor_date" type="date" defaultValue={today()} required /></label>
        <PixelSelect label="Categoría" name="category" value={recurringCategoryId || activeCategories[0]?.id || ''}
          options={activeCategories.map((item) => ({ value: item.id, label: item.name }))} onValueChange={setRecurringCategoryId} />
        <PixelSelect label="Frecuencia" name="cadence" value={recurringCadence}
          options={[{ value: 'weekly', label: 'Semanal' }, { value: 'monthly', label: 'Mensual' }]} onValueChange={setRecurringCadence} />
        <button disabled={busy || activeCategories.length === 0}>Crear regla</button>
      </form>
      {recurring.length > 0 && <ul className="courier-list">{recurring.map((item) => { const due = nextDue(item, expenses);
        return <li key={item.id}><strong>{item.description} · {asMoney(item.amount)}</strong>
          <p>{item.cadence === 'weekly' ? 'Semanal' : 'Mensual'} · Próxima fecha {due} · {item.active ? 'Activa' : 'Archivada'}</p>
          {item.active && <button type="button" disabled={busy} onClick={() => {
            if (!window.confirm(`¿Registrar el pago de ${item.description} por ${asMoney(item.amount)}?`)) return;
            void act(async () => { const { error } = await client.from('courier_expenses').insert({ user_id: userId,
              category_id: item.category_id, recurring_id: item.id, due_date: due, occurred_at: paidDate(due),
              description: item.description, amount: item.amount,
            }); if (error) throw error; }, 'Pago recurrente confirmado.');
          }}>Confirmar pago</button>}
          <button type="button" className="text-button" disabled={busy} onClick={() => void act(async () => {
            const { error } = await client.from('courier_recurring').update({ active: !item.active }).eq('id', item.id); if (error) throw error;
          }, 'Regla actualizada.')}>{item.active ? 'Archivar regla' : 'Reactivar regla'}</button>
        </li>;
      })}</ul>}
      <h2>Historial de gastos</h2>
      {expenses.length === 0 ? <p>Aún no hay gastos.</p> : <ul className="courier-list">{expenses.map((item) => <li key={item.id}>
        <strong>{item.description} · {asMoney(item.amount)}</strong>
        <p>{dateTime.format(new Date(item.occurred_at))} · {categories.find((cat) => cat.id === item.category_id)?.name}
          {item.shift_id ? ' · Jornada' : ''} {item.ruc ? ` · RUC ${item.ruc}` : ''}</p>
        <ExpenseEditor item={item} categories={categories} busy={busy} onSave={(data, categoryId, paymentMethod) => void act(async () => {
          const { error } = await client.from('courier_expenses').update({
            description: String(data.get('description') ?? '').trim(), amount: moneyInput(data.get('amount')),
            occurred_at: paidDate(String(data.get('occurred_on'))), category_id: categoryId,
            payment_method: paymentMethod, cash_paid: paymentMethod === 'cash' ? moneyInput(data.get('cash_paid'), true) : null,
            ruc: String(data.get('ruc') ?? '').trim() || null, notes: String(data.get('notes') ?? ''),
          }).eq('id', item.id); if (error) throw error;
        }, 'Gasto actualizado.')} />
        <button className="text-button" disabled={busy} onClick={() => { if (!window.confirm('¿Eliminar este gasto?')) return;
          void act(async () => { const { error } = await client.from('courier_expenses').delete().eq('id', item.id); if (error) throw error; }, 'Gasto eliminado.'); }}>Eliminar</button>
      </li>)}</ul>}
    </> : <>
      <h2>Combustible</h2><p>Las recargas se registran aparte y cuentan una sola vez en los reportes.</p>
      <form className="courier-form" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
        void act(async () => { const { error } = await client.from('courier_fuel').insert({ user_id: userId,
          amount: moneyInput(data.get('amount')), liters: String(data.get('liters') ?? '') || null,
          odometer_km: String(data.get('odometer_km') ?? '') || null, full_tank: data.get('full_tank') === 'on',
          shift_id: fuelShiftId || null, payment_method: fuelMethod,
          cash_paid: fuelMethod === 'cash' ? moneyInput(data.get('cash_paid'), true) : null,
          notes: String(data.get('notes') ?? ''),
        }); if (error) throw error; form.reset(); }, 'Recarga guardada.'); }}>
        <label>Importe (PEN)<input name="amount" type="number" min="0.01" step="0.01" required /></label>
        <label>Litros<input name="liters" type="number" min="0.001" step="0.001" /></label>
        <label>Odómetro (km)<input name="odometer_km" type="number" min="0" step="0.1" /></label>
        <PixelSelect label="Jornada" name="shift" value={fuelShiftId} options={shiftOptions} onValueChange={setFuelShiftId} />
        <PixelSelect label="Método" name="method" value={fuelMethod} options={methods} onValueChange={setFuelMethod} />
        {fuelMethod === 'cash' && <label>Efectivo entregado<input name="cash_paid" type="number" min="0" step="0.01" /></label>}
        <label className="courier-check"><input type="checkbox" name="full_tank" /> Tanque lleno</label>
        <label>Notas<input name="notes" maxLength={500} /></label>
        <button disabled={busy}>Guardar recarga</button>
      </form>
      {fuel.length === 0 ? <p>Aún no hay recargas.</p> : <ul className="courier-list">{fuel.map((item) => <li key={item.id}>
        <strong>{asMoney(item.amount)} · {item.liters ?? '—'} L</strong>
        <p>{dateTime.format(new Date(item.occurred_at))} · {item.odometer_km ?? '—'} km · {item.full_tank ? 'Tanque lleno' : 'Recarga parcial'}</p>
        <FuelEditor item={item} busy={busy} onSave={(data, method) => void act(async () => {
          const { error } = await client.from('courier_fuel').update({ amount: moneyInput(data.get('amount')),
            liters: String(data.get('liters') ?? '') || null, odometer_km: String(data.get('odometer_km') ?? '') || null,
            payment_method: method, cash_paid: method === 'cash' ? moneyInput(data.get('cash_paid'), true) : null,
            full_tank: data.get('full_tank') === 'on', notes: String(data.get('notes') ?? ''),
          }).eq('id', item.id); if (error) throw error;
        }, 'Recarga actualizada.')} />
      </li>)}</ul>}
    </>}
  </div>;
}

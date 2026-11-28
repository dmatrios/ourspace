'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import PixelSelect, { type PixelSelectOption } from './pixel-select';
import { connect } from '../lib/supabase';

type Client = NonNullable<ReturnType<typeof connect>>;
type Expense = {
  id: string; owner_id: string; space_id: string | null; paid_by: string;
  occurred_on: string; amount: string | number; category: string; description: string;
};

const categories: PixelSelectOption[] = [
  { value: 'food', label: 'Comida' }, { value: 'home', label: 'Hogar' },
  { value: 'transport', label: 'Transporte' }, { value: 'health', label: 'Salud' },
  { value: 'fun', label: 'Ocio' }, { value: 'other', label: 'Otro' },
];
const scopes: PixelSelectOption[] = [{ value: 'personal', label: 'Personal' }, { value: 'shared', label: 'En pareja' }];
const money = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
const dateFormat = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: 'UTC' });

function cents(value: string | number): number {
  const [units, decimals = ''] = String(value).split('.');
  return Number(units) * 100 + Number(decimals.padEnd(2, '0').slice(0, 2));
}

function todayInLima(): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export default function Expenses({ client, userId, spaceId, canEditHome }: {
  client: Client; userId: string; spaceId: string | null; canEditHome: boolean;
}) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [members, setMembers] = useState<string[]>([userId]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [scope, setScope] = useState('personal');
  const [category, setCategory] = useState('food');
  const [paidBy, setPaidBy] = useState(userId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState('food');
  const [editPaidBy, setEditPaidBy] = useState(userId);

  const refresh = useCallback(async () => {
    const [list, household] = await Promise.all([
      client.from('expenses').select('id,owner_id,space_id,paid_by,occurred_on,amount,category,description')
        .order('occurred_on', { ascending: false }),
      spaceId ? client.rpc('household_member_ids') : Promise.resolve({ data: [userId], error: null }),
    ]);
    if (list.error || household.error) throw list.error ?? household.error;
    setExpenses((list.data ?? []).filter((item) => item.space_id === null || item.space_id === spaceId));
    setMembers(household.data ?? [userId]);
    setLoaded(true);
  }, [client, spaceId, userId]);

  useEffect(() => {
    const update = () => { void refresh().catch(() => { setLoaded(true); setMessage('No se pudieron cargar los gastos. Revisa tu conexión.'); }); };
    const first = window.setTimeout(update, 0);
    const timer = window.setInterval(() => { if (!document.hidden) update(); }, 5000);
    window.addEventListener('focus', update);
    return () => { window.clearTimeout(first); window.clearInterval(timer); window.removeEventListener('focus', update); };
  }, [refresh]);

  const payerOptions: PixelSelectOption[] = members.map((id) => ({ value: id, label: id === userId ? 'Yo' : 'Mi pareja' }));
  const totalPersonal = expenses.filter((item) => !item.space_id).reduce((sum, item) => sum + cents(item.amount), 0);
  const totalShared = expenses.filter((item) => item.space_id).reduce((sum, item) => sum + cents(item.amount), 0);

  async function act(operation: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try { await operation(); await refresh(); }
    catch { setMessage('No se pudo guardar el gasto. Comprueba los datos y la conexión.'); }
    finally { setBusy(false); }
  }

  function addExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const amount = String(data.get('amount') ?? '');
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || cents(amount) < 1) {
      setMessage('Escribe un importe positivo con hasta dos decimales.'); return;
    }
    void act(async () => {
      const { error } = await client.from('expenses').insert({
        owner_id: userId,
        space_id: scope === 'shared' && canEditHome ? spaceId : null,
        paid_by: scope === 'shared' && canEditHome ? paidBy : userId,
        occurred_on: data.get('occurred_on'), amount, category,
        description: String(data.get('description') ?? '').trim(),
      });
      if (error) throw error;
      form.reset();
      setScope('personal'); setCategory('food'); setPaidBy(userId);
      setMessage('Gasto registrado.');
    });
  }

  function saveExpense(event: FormEvent<HTMLFormElement>, item: Expense) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = String(data.get('amount') ?? '');
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || cents(amount) < 1) {
      setMessage('Escribe un importe positivo con hasta dos decimales.'); return;
    }
    void act(async () => {
      const { data: saved, error } = await client.from('expenses').update({
        occurred_on: data.get('occurred_on'), amount, category: editCategory,
        paid_by: item.space_id ? editPaidBy : userId,
        description: String(data.get('description') ?? '').trim(),
      }).eq('id', item.id).select('id').maybeSingle();
      if (error || !saved) throw error ?? new Error('Expense unavailable');
      setEditingId(null);
      setMessage('Gasto actualizado.');
    });
  }

  return <section className="panel expenses-panel">
    <h1>Gastos</h1>
    <p>Registra lo que gastaste tú o lo que compartieron. En los gastos de pareja puedes indicar quién pagó.</p>
    {message && <p role="status" className="notice">{message}</p>}
    <div className="expense-totals">
      <p><strong>Personales</strong><span>{money.format(totalPersonal / 100)}</span></p>
      <p><strong>En pareja</strong><span>{money.format(totalShared / 100)}</span></p>
    </div>
    <form className="expense-form" onSubmit={addExpense}>
      <label>Descripción<input name="description" maxLength={200} required placeholder="¿En qué gastaron?" /></label>
      <label>Importe (PEN)<input name="amount" type="number" min="0.01" step="0.01" required /></label>
      <label>Fecha<input name="occurred_on" type="date" defaultValue={todayInLima()} required /></label>
      <PixelSelect label="Categoría" name="category" value={category} options={categories} onValueChange={setCategory} />
      <PixelSelect label="Visibilidad" name="scope" value={scope} options={canEditHome ? scopes : scopes.slice(0, 1)} onValueChange={setScope} />
      {scope === 'shared' && canEditHome && <PixelSelect label="Pagó" name="paid_by" value={paidBy} options={payerOptions} onValueChange={setPaidBy} />}
      <button disabled={busy}>Registrar gasto</button>
    </form>
    {!loaded ? <p role="status">Cargando gastos…</p> : expenses.length === 0 ? <p>Aún no hay gastos registrados.</p> :
      <ul className="expenses-list">{expenses.map((item) => <li key={item.id}>
        <div className="expense-heading"><strong>{item.description}</strong><strong>{money.format(cents(item.amount) / 100)}</strong></div>
        <p>{categories.find((option) => option.value === item.category)?.label ?? 'Otro'} · {item.space_id ? 'En pareja' : 'Personal'} · Pagó {item.paid_by === userId ? 'yo' : 'mi pareja'} · {dateFormat.format(new Date(`${item.occurred_on}T00:00:00Z`))}</p>
        <div className="expense-actions">
          <button type="button" className="text-button" disabled={busy || Boolean(item.space_id && !canEditHome)}
            aria-expanded={editingId === item.id} onClick={() => {
              if (editingId === item.id) setEditingId(null);
              else { setEditingId(item.id); setEditCategory(item.category); setEditPaidBy(item.paid_by); }
            }}>{editingId === item.id ? 'Cerrar edición' : 'Editar'}</button>
          <button type="button" className="text-button" disabled={busy || Boolean(item.space_id && !canEditHome)} onClick={() => {
            if (!window.confirm('¿Eliminar este gasto?')) return;
            void act(async () => {
              const { data, error } = await client.from('expenses').delete().eq('id', item.id).select('id').maybeSingle();
              if (error || !data) throw error ?? new Error('Expense unavailable');
              setMessage('Gasto eliminado.');
            });
          }}>Eliminar</button>
        </div>
        {editingId === item.id && <form className="expense-form expense-edit" onSubmit={(event) => saveExpense(event, item)}>
          <label>Descripción<input name="description" maxLength={200} defaultValue={item.description} required /></label>
          <label>Importe (PEN)<input name="amount" type="number" min="0.01" step="0.01" defaultValue={item.amount} required /></label>
          <label>Fecha<input name="occurred_on" type="date" defaultValue={item.occurred_on} required /></label>
          <PixelSelect label="Categoría" name="category" value={editCategory} options={categories} onValueChange={setEditCategory} />
          {item.space_id && <PixelSelect label="Pagó" name="paid_by" value={editPaidBy}
            options={members.includes(item.paid_by) ? payerOptions : [...payerOptions, { value: item.paid_by, label: 'Mi expareja' }]}
            onValueChange={setEditPaidBy} />}
          <button disabled={busy}>Guardar cambios</button>
        </form>}
      </li>)}</ul>}
  </section>;
}

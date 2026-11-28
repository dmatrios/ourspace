'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { connect } from '../lib/supabase';
import PixelSelect from './pixel-select';

type Client = NonNullable<ReturnType<typeof connect>>;
type Item = { id: string; name: string };
type Context = {
  user_id: string; name: string;
  shift: { id: string; platform_id: string; status: 'active' | 'paused' } | null;
  platforms: Item[]; categories: Item[];
  recent: { kind: 'receipt' | 'expense'; description: string; amount: string; occurred_at: string }[];
};

const money = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
const time = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' });

export default function CourierPartnerLog({ client }: { client: Client }) {
  const [context, setContext] = useState<Context | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [kind, setKind] = useState<'receipt' | 'expense'>('receipt');
  const [method, setMethod] = useState('cash');
  const [categoryId, setCategoryId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    const { data, error } = await client.rpc('courier_partner_context');
    if (error) throw error;
    setContext(data as Context | null);
    setLoaded(true);
  }, [client]);

  useEffect(() => {
    const update = () => { void refresh().catch(() => { setLoaded(true); setMessage('No se pudo consultar el permiso de reparto.'); }); };
    const first = window.setTimeout(update, 0);
    const timer = window.setInterval(() => { if (!document.hidden) update(); }, 10000);
    window.addEventListener('focus', update);
    return () => { window.clearTimeout(first); window.clearInterval(timer); window.removeEventListener('focus', update); };
  }, [refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!context?.shift) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true); setMessage('');
    try {
      const shared = { p_shift_id: context.shift.id, p_amount: String(values.get('amount')),
        p_method: String(values.get('method')) };
      const result = kind === 'receipt'
        ? await client.rpc('courier_partner_add_receipt', { ...shared,
          p_cash_received: method === 'cash' ? String(values.get('cash_amount') ?? '') || null : null,
          p_description: String(values.get('description') ?? '').trim() })
        : await client.rpc('courier_partner_add_expense', { ...shared,
          p_category_id: String(values.get('category_id')),
          p_cash_paid: method === 'cash' ? String(values.get('cash_amount') ?? '') || null : null,
          p_description: String(values.get('description') ?? '').trim() });
      if (result.error) throw result.error;
      form.reset(); setMethod('cash');
      await refresh();
      setMessage(kind === 'receipt' ? 'Cobro añadido a la jornada de tu pareja.' : 'Gasto añadido a la jornada de tu pareja.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar. Revisa la conexión y el permiso.');
      await refresh().catch(() => undefined);
    } finally { setBusy(false); }
  }

  const selectedCategory = context?.categories.some((item) => item.id === categoryId)
    ? categoryId : context?.categories[0]?.id ?? '';

  return <section className="courier-section" aria-label="Registro para mi pareja">
    <h2>Registrar para mi pareja</h2>
    {!loaded ? <p>Cargando permiso…</p> : !context ?
      <p>Tu pareja puede permitirte anotar cobros y gastos de su jornada desde los ajustes de Reparto.</p> : <>
      <p>{context.name} te permitió registrar movimientos mientras reparte. La jornada y los reportes siguen bajo su control.</p>
      {!context.shift ? <p>No hay una jornada en curso. Cuando {context.name} la inicie, podrás registrar movimientos aquí.</p> : <>
        <p><strong>Jornada {context.shift.status === 'paused' ? 'en pausa' : 'en curso'}</strong> · {context.platforms.find((p) => p.id === context.shift?.platform_id)?.name ?? 'Plataforma'}</p>
        <div className="courier-tabs" role="group" aria-label="Tipo de movimiento">
          <button type="button" className={kind === 'receipt' ? '' : 'secondary'} aria-pressed={kind === 'receipt'} onClick={() => setKind('receipt')}>Cobro</button>
          <button type="button" className={kind === 'expense' ? '' : 'secondary'} aria-pressed={kind === 'expense'} onClick={() => setKind('expense')}>Gasto de trabajo</button>
        </div>
        <form className="courier-form" key={kind} onSubmit={(event) => void submit(event)}>
          {kind === 'expense' && <PixelSelect label="Categoría" name="category_id" value={selectedCategory}
            onValueChange={setCategoryId} options={context.categories.map((item) => ({ value: item.id, label: item.name }))} />}
          <label>Importe (PEN)<input name="amount" type="number" min="0.01" step="0.01" required /></label>
          <label>Descripción<input name="description" maxLength={200} required={kind === 'expense'} placeholder={kind === 'receipt' ? 'Pedido o referencia' : '¿En qué se gastó?'} /></label>
          <PixelSelect label="Medio de pago" name="method" value={method} onValueChange={setMethod} options={[
            { value: 'cash', label: 'Efectivo' }, { value: 'yape', label: 'Yape' },
            { value: 'plin', label: 'Plin' }, { value: 'card', label: 'Tarjeta' },
          ]} />
          {method === 'cash' && <label>{kind === 'receipt' ? 'Efectivo recibido' : 'Efectivo pagado'} (opcional)
            <input name="cash_amount" type="number" min="0" step="0.01" /></label>}
          <button disabled={busy || (kind === 'expense' && context.categories.length === 0)}>Guardar {kind === 'receipt' ? 'cobro' : 'gasto'}</button>
        </form>
      </>}
      {context.recent.length > 0 && <div><h3>Lo que registraste</h3><ul className="courier-list">
        {context.recent.map((item, index) => <li key={`${item.kind}-${item.occurred_at}-${index}`}>
          {item.kind === 'receipt' ? 'Cobro' : 'Gasto'} · {money.format(Number(item.amount))} · {item.description || 'Sin descripción'} · {time.format(new Date(item.occurred_at))}
        </li>)}
      </ul></div>}
    </>}
    {message && <p role="status" className="notice">{message}</p>}
  </section>;
}

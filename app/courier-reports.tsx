'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PixelSelect from './pixel-select';
import { connect } from '../lib/supabase';
import { allRows } from '../lib/supabase-pages';

type Client = NonNullable<ReturnType<typeof connect>>;
type Platform = { id: string; name: string; cash_limit: string | null };
type Shift = { id: string; platform_id: string; started_at: string; ended_at: string | null; status: string;
  opening_cash: string; cash_counted: string | null; odometer_start: string | null; odometer_end: string | null };
type Earning = { id: string; platform_id: string; shift_id: string | null; earned_on: string; reported_amount: string;
  tips: string; bonuses: string; tips_included: boolean; bonuses_included: boolean; orders: number };
type Expense = { id: string; category_id: string; shift_id: string | null; occurred_at: string; amount: string; payment_method: string | null };
type Fuel = { id: string; shift_id: string | null; occurred_at: string; amount: string; liters: string | null;
  odometer_km: string | null; full_tank: boolean; payment_method: string | null };
type Receipt = { id: string; platform_id: string; shift_id: string | null; occurred_at: string; amount: string; payment_method: string };
type Pause = { id: string; shift_id: string; started_at: string; ended_at: string | null };
type Category = { id: string; name: string; kind: 'operational' | 'personal' };
const formatMoney = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
const cents = (value: string | number) => { const [whole, fraction = ''] = String(value).split('.'); return Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2)); };
const money = (value: number) => formatMoney.format(value / 100);
const localDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function periodRange(kind: 'day' | 'week' | 'month', anchor: string) {
  const start = new Date(`${anchor}T12:00:00Z`);
  if (kind === 'week') { const day = start.getUTCDay(); start.setUTCDate(start.getUTCDate() - ((day + 6) % 7)); }
  if (kind === 'month') start.setUTCDate(1);
  const end = new Date(start);
  if (kind === 'day') end.setUTCDate(end.getUTCDate() + 1);
  if (kind === 'week') end.setUTCDate(end.getUTCDate() + 7);
  if (kind === 'month') end.setUTCMonth(end.getUTCMonth() + 1);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function navigate(kind: 'day' | 'week' | 'month', anchor: string, delta: number) {
  const date = new Date(`${anchor}T12:00:00Z`);
  if (kind === 'month') date.setUTCMonth(date.getUTCMonth() + delta);
  else date.setUTCDate(date.getUTCDate() + delta * (kind === 'week' ? 7 : 1));
  return date.toISOString().slice(0, 10);
}

function overlappingMs(start: string, end: string | null, from: number, until: number) {
  return Math.max(0, Math.min(new Date(end ?? new Date()).getTime(), until) - Math.max(new Date(start).getTime(), from));
}

function downloadPdf(lines: string[], fileName: string) {
  const clean = (value: string) => value.normalize('NFKD').replace(/[^\x20-\x7E]/g, '')
    .replace(/[\\()]/g, (character) => `\\${character}`).slice(0, 95);
  const pages = Array.from({ length: Math.max(1, Math.ceil(lines.length / 43)) }, (_, index) => lines.slice(index * 43, (index + 1) * 43));
  const fontId = 3 + pages.length * 2;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  ];
  pages.forEach((pageLines, index) => {
    const contentId = 4 + index * 2;
    const stream = ['BT', '/F1 12 Tf', '48 790 Td', '16 TL',
      ...pageLines.flatMap((line, lineIndex) => lineIndex === 0 ? [`(${clean(line)}) Tj`] : ['T*', `(${clean(line)}) Tj`]), 'ET'].join('\n');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`);
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let pdf = '%PDF-1.4\n'; const positions = [0];
  objects.forEach((body, index) => { positions.push(new TextEncoder().encode(pdf).length); pdf += `${index + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  positions.slice(1).forEach((position) => { pdf += `${String(position).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
  const link = document.createElement('a'); link.href = url; link.download = fileName; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function CourierReports({ client, platforms, weeklyGoal }: {
  client: Client; platforms: Platform[]; weeklyGoal: string | null;
}) {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [anchor, setAnchor] = useState(localDay);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [fuel, setFuel] = useState<Fuel[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [pauses, setPauses] = useState<Pause[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    const [e, x, f, r, s, p, c] = await Promise.all([
      allRows<Earning>(client, 'courier_earnings', 'id,platform_id,shift_id,earned_on,reported_amount,tips,bonuses,tips_included,bonuses_included,orders'),
      allRows<Expense>(client, 'courier_expenses', 'id,category_id,shift_id,occurred_at,amount,payment_method'),
      allRows<Fuel>(client, 'courier_fuel', 'id,shift_id,occurred_at,amount,liters,odometer_km,full_tank,payment_method'),
      allRows<Receipt>(client, 'courier_receipts', 'id,platform_id,shift_id,occurred_at,amount,payment_method'),
      allRows<Shift>(client, 'courier_shifts', 'id,platform_id,started_at,ended_at,status,opening_cash,cash_counted,odometer_start,odometer_end'),
      allRows<Pause>(client, 'courier_pauses', 'id,shift_id,started_at,ended_at'),
      allRows<Category>(client, 'courier_categories', 'id,name,kind'),
    ]);
    setEarnings(e); setExpenses(x); setFuel(f); setReceipts(r); setShifts(s); setPauses(p); setCategories(c);
    setLoaded(true); setMessage('');
  }, [client]);

  useEffect(() => { const timer = window.setTimeout(() => { void refresh().catch(() => { setLoaded(true); setMessage('No se pudieron cargar los reportes.'); }); }, 0);
    return () => window.clearTimeout(timer); }, [refresh]);

  const range = periodRange(period, anchor);
  const report = useMemo(() => {
    const withinDay = (day: string) => day >= range.start && day < range.end;
    const withinTime = (timestamp: string) => {
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp));
      return withinDay(day);
    };
    const periodEarnings = earnings.filter((item) => withinDay(item.earned_on));
    const periodExpenses = expenses.filter((item) => withinTime(item.occurred_at));
    const periodFuel = fuel.filter((item) => withinTime(item.occurred_at));
    const periodReceipts = receipts.filter((item) => withinTime(item.occurred_at));
    const gross = periodEarnings.reduce((sum, item) => sum + cents(item.reported_amount) +
      (item.tips_included ? 0 : cents(item.tips)) + (item.bonuses_included ? 0 : cents(item.bonuses)), 0);
    const operational = periodExpenses.filter((item) => categories.find((cat) => cat.id === item.category_id)?.kind === 'operational')
      .reduce((sum, item) => sum + cents(item.amount), 0);
    const personal = periodExpenses.filter((item) => categories.find((cat) => cat.id === item.category_id)?.kind === 'personal')
      .reduce((sum, item) => sum + cents(item.amount), 0);
    const fuelSpent = periodFuel.reduce((sum, item) => sum + cents(item.amount), 0);
    const from = new Date(`${range.start}T00:00:00-05:00`).getTime();
    const until = new Date(`${range.end}T00:00:00-05:00`).getTime();
    const workedMs = shifts.reduce((sum, shift) => sum + overlappingMs(shift.started_at, shift.ended_at, from, until), 0)
      - pauses.reduce((sum, pause) => sum + overlappingMs(pause.started_at, pause.ended_at, from, until), 0);
    const km = shifts.filter((shift) => withinTime(shift.started_at) && shift.odometer_start && shift.odometer_end)
      .reduce((sum, shift) => sum + Number(shift.odometer_end) - Number(shift.odometer_start), 0);
    const byPlatform = platforms.map((platform) => ({ name: platform.name, total: periodEarnings
      .filter((item) => item.platform_id === platform.id).reduce((sum, item) => sum + cents(item.reported_amount) +
        (item.tips_included ? 0 : cents(item.tips)) + (item.bonuses_included ? 0 : cents(item.bonuses)), 0) }));
    const byCategory = categories.map((category) => ({ name: category.name,
      total: periodExpenses.filter((item) => item.category_id === category.id).reduce((sum, item) => sum + cents(item.amount), 0) }));
    const byDay = Array.from(new Set(periodEarnings.map((item) => item.earned_on))).sort().map((day) => ({ day,
      total: periodEarnings.filter((item) => item.earned_on === day).reduce((sum, item) => sum + cents(item.reported_amount) +
        (item.tips_included ? 0 : cents(item.tips)) + (item.bonuses_included ? 0 : cents(item.bonuses)), 0) }));
    const orders = periodEarnings.reduce((sum, item) => sum + item.orders, 0) || periodReceipts.length;
    return { gross, operational, personal, fuelSpent, receipts: periodReceipts, expenses: periodExpenses, fuel: periodFuel,
      workedHours: Math.max(0, workedMs) / 3600000, km, byPlatform, byCategory, byDay, orders };
  }, [range.start, range.end, earnings, expenses, fuel, receipts, shifts, pauses, categories, platforms]);

  const fullTanks = fuel.filter((item) => item.full_tank && item.odometer_km != null).sort((a, b) => Number(a.odometer_km) - Number(b.odometer_km));
  const fuelIntervals = fullTanks.slice(1).map((current, index) => {
    const previous = fullTanks[index]; const traveled = Number(current.odometer_km) - Number(previous.odometer_km);
    const unknownRefill = fuel.some((item) => item.occurred_at > previous.occurred_at && item.occurred_at <= current.occurred_at
      && (item.odometer_km == null || item.liters == null));
    const refills = fuel.filter((item) => item.odometer_km != null && Number(item.odometer_km) > Number(previous.odometer_km)
      && Number(item.odometer_km) <= Number(current.odometer_km));
    const liters = refills.reduce((sum, item) => sum + Number(item.liters ?? 0), 0);
    return traveled > 0 && liters > 0 && !unknownRefill && refills.every((item) => item.liters != null) ? traveled / liters : null;
  }).filter((value): value is number => value !== null);
  const result = report.gross - report.operational - report.fuelSpent;
  const goalPercent = weeklyGoal && period === 'week' ? Math.round(report.gross / cents(weeklyGoal) * 100) : null;
  const label = `${range.start} a ${range.end} (fin exclusivo)`;

  return <div className="courier-section">
    <h2>Reportes de reparto</h2>
    <p>Ganancia bruta informada menos desembolsos registrados. Los cobros de pedidos no son ingresos adicionales.</p>
    {message && <p role="status" className="notice">{message}</p>}
    <div className="courier-report-nav">
      <PixelSelect label="Período" name="period" value={period} options={[{ value: 'day', label: 'Día' },
        { value: 'week', label: 'Semana' }, { value: 'month', label: 'Mes' }]} onValueChange={(value) => setPeriod(value as typeof period)} />
      <button type="button" className="secondary" onClick={() => setAnchor(navigate(period, anchor, -1))}>← Anterior</button>
      <label>Fecha<input type="date" value={anchor} onChange={(event) => setAnchor(event.target.value)} /></label>
      <button type="button" className="secondary" onClick={() => setAnchor(navigate(period, anchor, 1))}>Siguiente →</button>
    </div>
    {!loaded ? <p>Cargando reportes…</p> : <>
      <p><strong>{label}</strong></p>
      <div className="courier-report-cards">
        <p><span>Ganancia bruta</span><strong>{money(report.gross)}</strong></p>
        <p><span>Gastos operativos</span><strong>{money(report.operational)}</strong></p>
        <p><span>Combustible comprado</span><strong>{money(report.fuelSpent)}</strong></p>
        <p><span>Resultado operativo</span><strong>{money(result)}</strong></p>
        <p><span>Gastos personales</span><strong>{money(report.personal)}</strong></p>
        <p><span>Horas efectivas</span><strong>{report.workedHours.toFixed(1)} h</strong></p>
        <p><span>Pedidos</span><strong>{report.orders}</strong></p>
        <p><span>Kilómetros medidos</span><strong>{report.km.toFixed(1)} km</strong></p>
      </div>
      {goalPercent !== null && <div className="courier-goal"><p>Mi semana: {goalPercent}% de la meta de {formatMoney.format(Number(weeklyGoal))}</p>
        <progress value={Math.min(goalPercent, 100)} max={100} aria-label="Avance de la meta semanal" /></div>}
      <p>Productividad: {report.workedHours > 0 ? `${money(Math.round(report.gross / report.workedHours))}/h bruto · ${money(Math.round(result / report.workedHours))}/h operativo` : 'sin horas suficientes'}
        {' · '}{report.km > 0 ? `${money(Math.round(result / report.km))}/km operativo` : 'sin kilómetros suficientes'}</p>
      <h2>Por plataforma</h2>
      {report.byPlatform.every((item) => item.total === 0) ? <p>Sin ganancias en este período.</p> : <div className="courier-bars">
        {report.byPlatform.filter((item) => item.total !== 0).map((item) => <div key={item.name}>
          <div><span>{item.name}</span><strong>{money(item.total)}</strong></div>
          <div className="courier-bar"><span style={{ width: `${Math.max(3, item.total / Math.max(report.gross, 1) * 100)}%` }} /></div>
        </div>)}</div>}
      <h2>Ganancia por día</h2>
      {report.byDay.length === 0 ? <p>Sin ganancias registradas.</p> : <div className="courier-bars">
        {report.byDay.map((item) => <div key={item.day}><div><span>{item.day}</span><strong>{money(item.total)}</strong></div>
          <div className="courier-bar"><span style={{ width: `${Math.max(3, item.total / Math.max(...report.byDay.map((day) => day.total), 1) * 100)}%` }} /></div>
        </div>)}</div>}
      <h2>Por categoría de gasto</h2>
      <ul className="courier-list">{report.byCategory.filter((item) => item.total > 0).map((item) => <li key={item.name}>
        <strong>{item.name}</strong><span>{money(item.total)}</span></li>)}</ul>
      {fuelIntervals.length > 0 && <p>Consumo entre llenados: {(fuelIntervals.reduce((a, b) => a + b, 0) / fuelIntervals.length).toFixed(1)} km/L.
        Es una estimación; puede incluir viajes personales.</p>}
      <details><summary>Arqueo y límites de efectivo</summary>
        <ul className="courier-list">{shifts.filter((item) => item.status === 'completed' &&
          new Date(item.started_at).getTime() >= new Date(`${range.start}T00:00:00-05:00`).getTime() &&
          new Date(item.started_at).getTime() < new Date(`${range.end}T00:00:00-05:00`).getTime()).map((shift) => {
          const cashReceipts = receipts.filter((item) => item.shift_id === shift.id && item.payment_method === 'cash')
            .reduce((sum, item) => sum + cents(item.amount), 0);
          const cashSpent = expenses.filter((item) => item.shift_id === shift.id && item.payment_method === 'cash')
            .reduce((sum, item) => sum + cents(item.amount), 0) + fuel.filter((item) => item.shift_id === shift.id && item.payment_method === 'cash')
            .reduce((sum, item) => sum + cents(item.amount), 0);
          const expected = cents(shift.opening_cash) + cashReceipts - cashSpent;
          const limit = platforms.find((item) => item.id === shift.platform_id)?.cash_limit;
          return <li key={shift.id}><strong>{platforms.find((item) => item.id === shift.platform_id)?.name}</strong>
            <p>Saldo esperado {money(expected)} · Cobros en efectivo {money(cashReceipts)}
              {limit != null ? ` · Exceso sobre límite ${money(Math.max(0, cashReceipts - cents(limit)))}` : ''}
              {shift.cash_counted != null ? ` · Diferencia de arqueo ${money(cents(shift.cash_counted) - expected)}` : ''}</p>
          </li>;
        })}</ul></details>
      <button type="button" className="secondary" onClick={() => downloadPdf([
        'Our Space - Reporte de reparto', label, `Ganancia bruta: ${money(report.gross)}`,
        `Gastos operativos: ${money(report.operational)}`, `Combustible: ${money(report.fuelSpent)}`,
        `Resultado operativo: ${money(result)}`, `Gastos personales: ${money(report.personal)}`,
        `Horas efectivas: ${report.workedHours.toFixed(1)}`, `Pedidos: ${report.orders}`,
        `Kilometros medidos: ${report.km.toFixed(1)}`,
        ...report.byPlatform.map((item) => `${item.name}: ${money(item.total)}`),
        ...report.byDay.map((item) => `${item.day}: ${money(item.total)}`),
        ...report.byCategory.filter((item) => item.total > 0).map((item) => `${item.name}: ${money(item.total)}`),
      ], `ourspace-reparto-${range.start}.pdf`)}>Descargar PDF</button>
    </>}
  </div>;
}

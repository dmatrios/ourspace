'use client';

import { useRef, useState, type FormEvent } from 'react';

type Introduction = {
  is_mine: boolean;
  display_name: string;
  interests: string;
  short_goals: string;
  long_goals: string;
  revision: number;
};

export type CoupleOnboardingData = {
  relationship_since: string | null;
  introductions: Introduction[];
};

type Draft = Omit<Introduction, 'is_mine' | 'revision'> & { started_on: string };
export type SaveIntroduction = {
  preferred_name: string;
  likes: string;
  short_term: string;
  long_term: string;
  started_on: string | null;
  previous_started_on: string | null;
  expected_revision: number;
};

const steps = ['¿Cómo quieres que te llamen?', '¿Qué te gusta?', '¿Qué metas tienes?'] as const;
const dateLabel = new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeZone: 'UTC' });
const limaDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' });

function timeTogether(start: string, today: string) {
  const [startYear, startMonth, startDay] = start.split('-').map(Number);
  const [year, month, day] = today.split('-').map(Number);
  const months = (year - startYear) * 12 + month - startMonth - Number(day < startDay);
  if (months < 1) {
    const days = Math.max(0, Math.round((Date.parse(today) - Date.parse(start)) / 86_400_000));
    return days === 0 ? 'Desde hoy' : days === 1 ? '1 día juntos' : `${days} días juntos`;
  }
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  const parts = [
    years > 0 && (years === 1 ? '1 año' : `${years} años`),
    remainder > 0 && (remainder === 1 ? '1 mes' : `${remainder} meses`),
  ].filter(Boolean);
  return parts.join(' y ') + ' juntos';
}

function startDraft(data: CoupleOnboardingData): Draft {
  const mine = data.introductions.find((item) => item.is_mine);
  return {
    display_name: mine?.display_name ?? '',
    interests: mine?.interests ?? '',
    short_goals: mine?.short_goals ?? '',
    long_goals: mine?.long_goals ?? '',
    started_on: data.relationship_since ?? '',
  };
}

export default function CoupleOnboarding({ data, paired, canEdit, onSave }: {
  data: CoupleOnboardingData;
  paired: boolean;
  canEdit: boolean;
  onSave: (values: SaveIntroduction) => Promise<string>;
}) {
  const mine = data.introductions.find((item) => item.is_mine);
  const [draft, setDraft] = useState<Draft | null>(() => paired && !mine ? startDraft(data) : null);
  const [base, setBase] = useState({ date: data.relationship_since, revision: mine?.revision ?? 0 });
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const today = limaDay.format(new Date());

  function changeStep(next: number) {
    setStep(next);
    requestAnimationFrame(() => heading.current?.focus());
  }

  function open() {
    setDraft(startDraft(data));
    setBase({ date: data.relationship_since, revision: mine?.revision ?? 0 });
    setFeedback('');
    changeStep(0);
  }

  function change(field: keyof Draft, value: string) {
    setDraft((current) => current && { ...current, [field]: value });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving) return;
    if (step === 0 && !draft.display_name.trim()) {
      setFeedback('Escribe el nombre que quieres compartir.');
      return;
    }
    setFeedback('');
    if (step < steps.length - 1) { changeStep(step + 1); return; }

    setSaving(true);
    try {
      const result = await onSave({
        preferred_name: draft.display_name.trim(),
        likes: draft.interests.trim(),
        short_term: draft.short_goals.trim(),
        long_term: draft.long_goals.trim(),
        started_on: draft.started_on || null,
        previous_started_on: base.date,
        expected_revision: base.revision,
      });
      if (result === 'saved') {
        setDraft(null);
        setFeedback('Presentación guardada.');
        requestAnimationFrame(() => heading.current?.focus());
      } else if (result === 'date_conflict') {
        setFeedback('La fecha compartida cambió. Usa la fecha guardada para continuar o vuelve a seleccionarla después.');
        changeStep(0);
      } else if (result === 'profile_conflict') {
        setFeedback('Tu presentación cambió en otra sesión. Sal de la edición y vuelve a abrirla para cargar esa versión.');
      } else {
        setFeedback('No se pudieron guardar los datos. Revisa los campos e inténtalo de nuevo.');
      }
    } catch {
      setFeedback('No se pudo conectar. Puedes intentar guardar de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="couple-onboarding" aria-label="Su historia">
      {draft && canEdit ? (
        <form className="stack" onSubmit={submit}>
          <div className="onboarding-heading">
            <p>Paso {step + 1} de {steps.length}</p>
            <h2 ref={heading} tabIndex={-1}>{steps[step]}</h2>
          </div>
          {step === 0 && <>
            <label>Tu nombre
              <input name="preferred-name" autoComplete="nickname" maxLength={60} required
                value={draft.display_name} onChange={(event) => change('display_name', event.target.value)} />
            </label>
            <label>¿Desde cuándo están juntos? (opcional)
              <input name="relationship-since" type="date" min="1900-01-01" max={today}
                value={draft.started_on} onChange={(event) => change('started_on', event.target.value)} />
            </label>
            <p>La fecha es compartida. {data.relationship_since && <>La fecha guardada es <time dateTime={data.relationship_since}>{dateLabel.format(new Date(data.relationship_since))}</time>.</>}</p>
            {base.date !== data.relationship_since && <button type="button" className="secondary onboarding-edit" onClick={() => {
              setBase((current) => ({ ...current, date: data.relationship_since }));
              change('started_on', data.relationship_since ?? '');
              setFeedback('');
            }}>Usar la fecha guardada</button>}
          </>}
          {step === 1 && <>
            <label>Gustos e intereses (opcional)
              <textarea name="interests" rows={3} maxLength={400} placeholder="Ej. cocinar juntos o salir a caminar"
                value={draft.interests} onChange={(event) => change('interests', event.target.value)} />
            </label>
            <p>Tu pareja podrá ver lo que decidas escribir aquí.</p>
          </>}
          {step === 2 && <>
            <label>Metas a corto plazo (opcional)
              <textarea name="short-goals" rows={3} maxLength={600} placeholder="Ej. organizar una escapada este mes"
                value={draft.short_goals} onChange={(event) => change('short_goals', event.target.value)} />
            </label>
            <label>Metas a largo plazo (opcional)
              <textarea name="long-goals" rows={3} maxLength={600} placeholder="Ej. ahorrar para un viaje juntos"
                value={draft.long_goals} onChange={(event) => change('long_goals', event.target.value)} />
            </label>
            <p>Guarden aquí las ideas que quieren compartir. Pueden editarlas más adelante.</p>
          </>}
          {feedback && <p role="status">{feedback}</p>}
          <div className="onboarding-actions">
            {step > 0 && <button type="button" className="secondary" disabled={saving} onClick={() => changeStep(step - 1)}>Atrás</button>}
            <button disabled={saving}>{saving ? 'Guardando…' : step < 2 ? 'Continuar' : 'Guardar presentación'}</button>
            <button type="button" className="text-button" disabled={saving} onClick={() => {
              setDraft(null);
              setFeedback('');
              requestAnimationFrame(() => heading.current?.focus());
            }}>{mine ? 'Cancelar' : 'Ahora no'}</button>
          </div>
        </form>
      ) : (
        <div className="stack">
          <h2 ref={heading} tabIndex={-1}>Su historia</h2>
          {feedback && <p role="status">{feedback}</p>}
          {data.relationship_since && <p>
            {paired && <><strong>{timeTogether(data.relationship_since, today)}</strong> · </>}
            Desde el <time dateTime={data.relationship_since}>{dateLabel.format(new Date(data.relationship_since))}</time>
          </p>}
          {data.introductions.length > 0 && <ul className="introductions">
            {data.introductions.map(({ is_mine, display_name, interests, short_goals, long_goals }) => (
              <li key={is_mine ? 'mine' : 'partner'}>
                <h3>{display_name}</h3>
                {(interests || short_goals || long_goals) && <dl>
                  {interests && <><dt>Gustos e intereses</dt><dd>{interests}</dd></>}
                  {short_goals && <><dt>Metas a corto plazo</dt><dd>{short_goals}</dd></>}
                  {long_goals && <><dt>Metas a largo plazo</dt><dd>{long_goals}</dd></>}
                </dl>}
              </li>
            ))}
          </ul>}
          {canEdit && <button type="button" className="secondary onboarding-edit" onClick={open}>
            {mine ? 'Editar mi presentación' : 'Completar mi presentación'}
          </button>}
        </div>
      )}
    </section>
  );
}

'use client';

import { useState } from 'react';

export default function InvitationActions({ code }: { code: string }) {
  const [status, setStatus] = useState('');
  const appUrl = 'https://ourspace-amber.vercel.app/';
  const message = `Te invito a nuestro espacio en Our Space. Entra a ${appUrl}, crea tu cuenta o inicia sesión y escribe este código de 6 dígitos: ${code}. Caduca en 24 horas.`;
  const encodedMessage = encodeURIComponent(message);
  const emailSubject = encodeURIComponent('Te invito a nuestro espacio en Our Space');

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setStatus('Código copiado.');
    } catch {
      setStatus('No se pudo copiar automáticamente. Selecciona el código para copiarlo.');
    }
  }

  return (
    <div className="invite-actions">
      <button type="button" className="secondary" onClick={() => void copyCode()}>Copiar código</button>
      <a className="share-link" href={`https://wa.me/?text=${encodedMessage}`} target="_blank" rel="noreferrer">
        Enviar por WhatsApp
      </a>
      <a className="share-link" href={`mailto:?subject=${emailSubject}&body=${encodedMessage}`}>
        Enviar por correo
      </a>
      <span className="share-status" role="status" aria-live="polite">{status}</span>
    </div>
  );
}

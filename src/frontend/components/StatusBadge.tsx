import React from 'react';

const STYLES: Record<string, string> = {
  running: 'bg-blue-100 text-blue-700',
  pending: 'bg-yellow-100 text-yellow-700',
  done: 'bg-green-100 text-green-700',
  completed: 'bg-green-100 text-green-700',
  paused: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-red-100 text-red-700',
  sent: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  read: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  queued: 'bg-yellow-100 text-yellow-700',
  processing: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  pending_review: 'bg-yellow-100 text-yellow-700',
  rejected: 'bg-red-100 text-red-700',
};

const LABELS: Record<string, string> = {
  running: 'Em andamento', pending: 'Agendada', done: 'Concluida',
  completed: 'Concluida', paused: 'Pausada', cancelled: 'Cancelada',
  sent: 'Enviado', delivered: 'Entregue', read: 'Lido', failed: 'Falhou',
  queued: 'Na fila', processing: 'Processando',
  approved: 'Aprovado', pending_review: 'Em revisao', rejected: 'Rejeitado',
};

export default function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase();
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STYLES[key] ?? 'bg-gray-100 text-gray-700'}`}>
      {LABELS[key] ?? status}
    </span>
  );
}

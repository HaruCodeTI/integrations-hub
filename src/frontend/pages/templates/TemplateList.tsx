// src/frontend/pages/templates/TemplateList.tsx
import React, { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import TemplateBuilderModal from '../../components/TemplateBuilderModal';

interface Template {
  id?: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components?: Array<{ type: string; text?: string }>;
}

interface Account { name: string; phone_number_id: string; }

const statusVariant: Record<string, 'success' | 'error' | 'warning' | 'default'> = {
  APPROVED: 'success', REJECTED: 'error', PENDING: 'warning',
};
const statusLabel: Record<string, string> = {
  APPROVED: 'Aprovado', REJECTED: 'Rejeitado', PENDING: 'Pendente',
};

function getBodyText(components?: Template['components']): string {
  return components?.find(c => c.type === 'BODY')?.text ?? '';
}

export default function TemplateList() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedPhone, setSelectedPhone] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetch('/api/v2/accounts')
      .then(r => r.json())
      .then((data: Account[]) => {
        setAccounts(data);
        if (data.length > 0) setSelectedPhone(data[0].phone_number_id);
      })
      .catch(console.error);
  }, []);

  const loadTemplates = () => {
    if (!selectedPhone) return;
    setLoading(true);
    fetch(`/api/v2/templates/${selectedPhone}`)
      .then(r => {
        if (!r.ok) throw new Error('Erro ao carregar templates');
        return r.json();
      })
      .then(setTemplates)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadTemplates(); }, [selectedPhone]);

  const deleteTemplate = async (name: string) => {
    if (!confirm(`Excluir template "${name}"?`)) return;
    try {
      const res = await fetch(`/api/v2/templates/${selectedPhone}/${name}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json() as any;
        alert(d.error ?? 'Erro ao excluir template');
        return;
      }
      loadTemplates();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-text-primary">Templates</h1>
        <div className="flex items-center gap-3">
          <select
            value={selectedPhone}
            onChange={e => setSelectedPhone(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
          >
            {accounts.map(a => (
              <option key={a.phone_number_id} value={a.phone_number_id}>{a.name}</option>
            ))}
          </select>
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4" />
            Novo Template
          </Button>
        </div>
      </div>

      {loading && <p className="text-sm text-text-secondary">Carregando templates...</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(t => (
          <Card key={t.name} className="group">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-text-primary text-sm truncate">{t.name}</p>
                <p className="text-xs text-text-tertiary">{t.category} · {t.language}</p>
              </div>
              <Badge variant={statusVariant[t.status] ?? 'default'}>
                {statusLabel[t.status] ?? t.status}
              </Badge>
            </div>
            {getBodyText(t.components) && (
              <p className="mt-2 text-xs text-text-secondary line-clamp-3">{getBodyText(t.components)}</p>
            )}
            <div className="mt-3 pt-3 border-t border-border flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => deleteTemplate(t.name)}
                className="text-red-500 hover:text-red-600 p-1 rounded"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </Card>
        ))}
      </div>

      {!loading && templates.length === 0 && (
        <div className="text-center py-12 text-text-secondary">
          <p>Nenhum template encontrado para esta conta.</p>
        </div>
      )}

      {showModal && selectedPhone && (
        <TemplateBuilderModal
          phoneNumberId={selectedPhone}
          onClose={() => setShowModal(false)}
          onSuccess={loadTemplates}
        />
      )}
    </div>
  );
}

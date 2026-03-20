import React, { useEffect, useState } from 'react';

interface Account { id: string; name: string; phone_number_id: string; client_type: string; }
interface Props { value: string; onChange: (v: string) => void; label?: string; }

export default function AccountSelector({ value, onChange, label }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v2/accounts')
      .then(r => { if (r.status === 401) { window.location.href = '/admin/login'; } return r.json(); })
      .then(data => { setAccounts(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-sm text-gray-400">Carregando contas...</div>;
  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        <option value="">Selecione uma conta...</option>
        {accounts.map(a => (
          <option key={a.phone_number_id} value={a.phone_number_id}>{a.name}</option>
        ))}
      </select>
    </div>
  );
}

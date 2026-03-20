// src/frontend/pages/accounts/AccountList.tsx
import React, { useState, useEffect } from 'react';
import { Smartphone, Plus, MoreVertical, Check, X } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';

interface Account {
  id: string;
  name: string;
  phone_number_id: string;
  active: number;
  created_at: string;
}

const AVATAR_COLORS = ['bg-primary', 'bg-green-500', 'bg-orange-500', 'bg-pink-500', 'bg-purple-500'];

export default function AccountList() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const load = () => {
    fetch('/api/v2/accounts')
      .then(r => r.json())
      .then(setAccounts)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggleActive = async (id: string, current: number) => {
    try {
      const res = await fetch(`/api/v2/accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: current ? 0 : 1 }),
      });
      if (!res.ok) throw new Error('Erro ao atualizar conta');
      load();
      setMenuOpen(null);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const deleteAccount = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta conta?')) return;
    try {
      const res = await fetch(`/api/v2/accounts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir conta');
      load();
      setMenuOpen(null);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const saveName = async (id: string) => {
    if (!editName.trim()) { alert('O nome não pode estar vazio'); return; }
    try {
      const res = await fetch(`/api/v2/accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (!res.ok) throw new Error('Erro ao salvar nome');
      load();
      setEditingId(null);
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Contas</h1>
        <Button onClick={() => window.open('/signup', '_blank')}>
          <Plus className="h-4 w-4" />
          Conectar nova conta
        </Button>
      </div>

      {loading && <p className="text-sm text-text-secondary">Carregando...</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map((account, i) => {
          const avatarColor = AVATAR_COLORS[i % AVATAR_COLORS.length];
          const initial = account.name.charAt(0).toUpperCase();
          return (
            <Card key={account.id} className="relative">
              {/* Menu de ações */}
              <div className="absolute top-3 right-3">
                <button
                  onClick={() => setMenuOpen(menuOpen === account.id ? null : account.id)}
                  className="p-1 rounded hover:bg-bg-default text-text-tertiary"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {menuOpen === account.id && (
                  <div className="absolute right-0 mt-1 w-44 bg-white border border-border rounded-lg shadow-lg z-10 py-1">
                    <button
                      onClick={() => { setEditingId(account.id); setEditName(account.name); setMenuOpen(null); }}
                      className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-bg-default"
                    >
                      Editar nome
                    </button>
                    <button
                      onClick={() => toggleActive(account.id, account.active)}
                      className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-bg-default"
                    >
                      {account.active ? 'Desativar' : 'Ativar'}
                    </button>
                    <button
                      onClick={() => deleteAccount(account.id)}
                      className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      Excluir
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 pr-6">
                {/* Avatar */}
                <div className={`h-10 w-10 rounded-full ${avatarColor} flex items-center justify-center text-white font-semibold text-sm shrink-0`}>
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  {editingId === account.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        className="border border-border rounded px-2 py-1 text-sm flex-1 min-w-0"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        autoFocus
                      />
                      <button onClick={() => saveName(account.id)} className="text-green-600 hover:text-green-700">
                        <Check className="h-4 w-4" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-red-500 hover:text-red-600">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <p className="font-medium text-text-primary text-sm truncate">{account.name}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Smartphone className="h-3 w-3 text-text-tertiary shrink-0" />
                    <p className="text-xs text-text-tertiary truncate">{account.phone_number_id}</p>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-border">
                <Badge variant={account.active ? 'success' : 'default'}>
                  {account.active ? 'Ativa' : 'Inativa'}
                </Badge>
              </div>
            </Card>
          );
        })}
      </div>

      {!loading && accounts.length === 0 && (
        <div className="text-center py-12 text-text-secondary">
          <Smartphone className="h-10 w-10 mx-auto mb-3 text-text-tertiary" />
          <p className="font-medium">Nenhuma conta conectada</p>
          <p className="text-sm mt-1">Clique em "Conectar nova conta" para começar</p>
        </div>
      )}
    </div>
  );
}

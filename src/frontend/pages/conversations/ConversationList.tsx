import React, { useEffect, useState } from 'react';
import AccountSelector from '../../components/AccountSelector';
import ConversationView from './ConversationView';

interface Conversation {
  contact_phone: string;
  last_at: string;
  last_content: string;
}

export default function ConversationList() {
  const [phoneId, setPhoneId] = useState('');
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!phoneId) return;
    setLoading(true);
    fetch(`/api/v2/conversations/${phoneId}`)
      .then(r => r.json())
      .then(data => { setConvs(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [phoneId]);

  function getLastText(content: string) {
    try {
      const c = JSON.parse(content);
      return c?.text?.body ?? '[midia]';
    } catch { return '[midia]'; }
  }

  return (
    <div className="flex h-full">
      {/* Coluna esquerda */}
      <div className="w-72 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <AccountSelector value={phoneId} onChange={setPhoneId} label="Conta" />
        </div>
        <div className="flex-1 overflow-auto">
          {loading && <div className="p-4 text-sm text-gray-400">Carregando...</div>}
          {!loading && convs.length === 0 && phoneId && (
            <div className="p-4 text-sm text-gray-400">Nenhuma conversa ainda.</div>
          )}
          {convs.map(c => (
            <button
              key={c.contact_phone}
              onClick={() => setSelected(c.contact_phone)}
              className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${selected === c.contact_phone ? 'bg-blue-50' : ''}`}
            >
              <div className="font-medium text-sm">{c.contact_phone}</div>
              <div className="text-xs text-gray-400 truncate">{getLastText(c.last_content)}</div>
              <div className="text-xs text-gray-300 mt-0.5">{new Date(c.last_at).toLocaleString('pt-BR')}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Coluna direita */}
      <div className="flex-1">
        {selected && phoneId
          ? <ConversationView phoneId={phoneId} contact={selected} />
          : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Selecione uma conversa
            </div>
          )
        }
      </div>
    </div>
  );
}

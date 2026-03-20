// src/frontend/pages/conversations/ConversationList.tsx
import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import ConversationView from './ConversationView';

interface Account {
  id: string;
  phone_number_id: string;
  name: string;
}

interface ConversationSummary {
  contact_phone: string;
  last_at: string;
  last_content: string;
  last_direction: 'inbound' | 'outbound';
}

interface Conversation extends ConversationSummary {
  phone_number_id: string;
  account_name: string;
}

const TABS = ['Todas', 'Lidas', 'Não lidas'];

// Inner component that renders ConversationView using route params + grouped data
function ConversationViewWrapper({ grouped }: { grouped: Record<string, Conversation[]> }) {
  const { phone } = useParams<{ phone: string }>();
  if (!phone) return null;

  // Find which account this phone belongs to
  let phoneId = '';
  for (const [pid, convs] of Object.entries(grouped)) {
    if (convs.some(c => c.contact_phone === phone)) {
      phoneId = pid;
      break;
    }
  }

  if (!phoneId) {
    return (
      <div className="flex items-center justify-center h-full text-text-secondary text-sm">
        Conversa não encontrada
      </div>
    );
  }

  return <ConversationView phoneId={phoneId} contact={phone} />;
}

export default function ConversationList() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeTab, setActiveTab] = useState('Todas');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();
  const params = useParams();

  useEffect(() => {
    // First fetch all accounts, then fetch conversations per account
    fetch('/api/v2/accounts')
      .then(r => r.json())
      .then(async (raw: unknown) => {
        const accounts = raw as Account[];
        if (!Array.isArray(accounts)) return;
        const results = await Promise.all(
          accounts.map(async (account) => {
            try {
              const rawConvs: unknown = await fetch(
                `/api/v2/conversations/${account.phone_number_id}`
              ).then(r => r.json());
              const convs = rawConvs as ConversationSummary[];
              if (!Array.isArray(rawConvs)) return [];
              return convs.map(c => ({
                ...c,
                phone_number_id: account.phone_number_id,
                account_name: account.name,
              }));
            } catch {
              return [];
            }
          })
        );
        setConversations(results.flat());
      })
      .catch(console.error);
  }, []);

  // Filtrar por tab
  const filtered = conversations.filter(c => {
    if (activeTab === 'Lidas') return c.last_direction === 'outbound';
    if (activeTab === 'Não lidas') return c.last_direction === 'inbound';
    return true;
  });

  // Agrupar por phone_number_id
  const grouped = filtered.reduce<Record<string, Conversation[]>>((acc, c) => {
    const key = c.phone_number_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  const toggleGroup = (key: string) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const selectedPhone = params['*']?.split('/')[0];

  return (
    <div className="flex h-full">
      {/* Sidebar de conversas */}
      <div className="w-72 shrink-0 border-r border-border flex flex-col bg-white">
        {/* Tabs */}
        <div className="flex border-b border-border overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Lista por conta (accordion) */}
        <div className="flex-1 overflow-y-auto">
          {Object.entries(grouped).map(([phoneId, convs]) => {
            const isCollapsed = collapsed[phoneId];
            const accountName = convs[0]?.account_name ?? phoneId;
            return (
              <div key={phoneId}>
                <button
                  onClick={() => toggleGroup(phoneId)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-bg-default hover:bg-border/30 text-xs font-semibold text-text-secondary uppercase tracking-wide"
                >
                  {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {accountName}
                  <span className="ml-auto text-text-tertiary font-normal">{convs.length}</span>
                </button>
                {!isCollapsed && convs.map(conv => {
                  const initial = conv.contact_phone.slice(-2);
                  const isSelected = selectedPhone === conv.contact_phone;
                  let lastContent = '';
                  try {
                    const parsed = JSON.parse(conv.last_content);
                    lastContent = parsed?.text?.body ?? parsed?.image?.caption ?? '[mídia]';
                  } catch { lastContent = conv.last_content; }

                  return (
                    <button
                      key={conv.contact_phone}
                      onClick={() => navigate(`/painel/conversas/${conv.contact_phone}`)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-bg-default transition-colors ${isSelected ? 'bg-primary-light' : ''}`}
                    >
                      <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-semibold shrink-0">
                        {initial}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-sm font-medium text-text-primary truncate">{conv.contact_phone}</p>
                          <span className="text-xs text-text-tertiary shrink-0">
                            {new Date(conv.last_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-xs text-text-secondary truncate">{lastContent}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
          {conversations.length === 0 && (
            <p className="text-xs text-text-tertiary p-4 text-center">Nenhuma conversa</p>
          )}
        </div>
      </div>

      {/* Área de visualização */}
      <div className="flex-1 overflow-hidden">
        <Routes>
          <Route path=":phone" element={<ConversationViewWrapper grouped={grouped} />} />
          <Route index element={
            <div className="flex items-center justify-center h-full text-text-secondary text-sm">
              Selecione uma conversa
            </div>
          } />
        </Routes>
      </div>
    </div>
  );
}

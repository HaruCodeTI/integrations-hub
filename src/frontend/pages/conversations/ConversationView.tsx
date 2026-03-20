import React, { useEffect, useRef, useState } from 'react';
import { Check, CheckCheck } from 'lucide-react';

function MessageTick({ status }: { status: string }) {
  if (status === 'read') return <CheckCheck className="inline h-3.5 w-3.5 text-blue-500 ml-1 shrink-0" />;
  if (status === 'delivered') return <CheckCheck className="inline h-3.5 w-3.5 text-gray-400 ml-1 shrink-0" />;
  return <Check className="inline h-3.5 w-3.5 text-gray-400 ml-1 shrink-0" />;
}

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  type: string;
  content: string;
  status: string;
  created_at: string;
}

interface Props { phoneId: string; contact: string; }

export default function ConversationView({ phoneId, contact }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const url = `/api/v2/conversations/${phoneId}/${encodeURIComponent(contact)}`;
    fetch(url, { signal: controller.signal })
      .then(r => r.json())
      .then(setMessages)
      .catch(() => {});
    const timer = setInterval(() => {
      fetch(url, { signal: controller.signal })
        .then(r => r.json()).then(setMessages).catch(() => {});
    }, 3000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [phoneId, contact]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function getBody(content: string): string {
    try {
      const c = JSON.parse(content);
      return c?.text?.body ?? `[${c?.type ?? 'midia'}]`;
    } catch { return '[conteudo]'; }
  }

  async function sendMessage() {
    if (!text.trim()) return;
    const body = text.trim();
    setText('');

    // Optimistic update — aparece imediatamente
    const tempId = `temp-${Date.now()}`;
    const tempMsg: Message = {
      id: tempId,
      direction: 'outbound',
      type: 'text',
      content: JSON.stringify({ text: { body } }),
      status: 'sent',
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMsg]);
    setSending(true);
    setError(null);

    try {
      const res = await fetch(`/api/v2/conversations/${phoneId}/${encodeURIComponent(contact)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: body }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as any;
        setError(err.error ?? 'Erro ao enviar mensagem');
        setMessages(prev => prev.filter(m => m.id !== tempId));
        return;
      }
      // Substitui a mensagem temp pela versão do servidor
      const updated = await fetch(`/api/v2/conversations/${phoneId}/${encodeURIComponent(contact)}`).then(r => r.json());
      setMessages(updated);
    } catch {
      setError('Erro de conexão');
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white">
        <div className="font-medium">{contact}</div>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-auto p-4 space-y-2">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs px-3 py-2 rounded-2xl text-sm ${
              msg.direction === 'outbound' ? 'bg-green-100 text-gray-800' : 'bg-white border border-gray-200 text-gray-800'
            }`}>
              <div>{getBody(msg.content)}</div>
              <div className="text-xs text-gray-400 mt-1 flex items-center justify-end gap-0.5">
                {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                {msg.direction === 'outbound' && <MessageTick status={msg.status} />}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Erro de envio */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-200 text-red-600 text-xs">{error}</div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-gray-200 bg-white flex gap-2">
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder="Digite uma mensagem..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={sendMessage}
          disabled={sending || !text.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
        >
          {sending ? '...' : 'Enviar'}
        </button>
      </div>
    </div>
  );
}

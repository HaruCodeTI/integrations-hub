import React, { useEffect, useRef, useState } from 'react';

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
    }, 10000);
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
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/conversations/${phoneId}/${encodeURIComponent(contact)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Erro ao enviar mensagem');
        return;
      }
      setText('');
      // Recarrega mensagens
      const updated = await fetch(`/api/v2/conversations/${phoneId}/${encodeURIComponent(contact)}`).then(r => r.json());
      setMessages(updated);
    } catch {
      setError('Erro de conexao');
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
              <div className="text-xs text-gray-400 mt-1 text-right">
                {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
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

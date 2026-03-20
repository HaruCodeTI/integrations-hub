# Plano 2: Conversations — Inbox por conta com historico

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o modulo de conversas: API que lista conversas e mensagens por conta, endpoint para envio manual, e paginas React ConversationList + ConversationView.

**Architecture:** O module conversations/ lida com consultas a tabela messages (populada pelo webhook desde o Plano 1). O envio reusa o sender.service.ts existente. O frontend exibe inbox estilo duas colunas: lista de contatos a esquerda, historico a direita.

**Tech Stack:** Bun, SQLite, React 18, TypeScript, Tailwind CSS

**Pre-requisito:** Plano 1 concluido (tabelas + SPA scaffold).

**Spec:** docs/superpowers/specs/2026-03-20-whatsapp-campaign-panel-design.md

---

## Mapa de Arquivos

| Arquivo | Acao | Responsabilidade |
|---|---|---|
| src/modules/conversations/conversations.service.ts | Criar | Consultas DB e envio manual |
| src/modules/conversations/conversations.controller.ts | Criar | Handlers HTTP |
| src/modules/conversations/conversations.routes.ts | Criar | Definicao de rotas |
| src/modules/conversations/conversations.service.test.ts | Criar | Testes da logica |
| src/routes/router.ts | Modificar | Incluir rotas conversations no bloco /api/v2/ |
| src/frontend/pages/conversations/ConversationList.tsx | Criar | Lista de contatos |
| src/frontend/pages/conversations/ConversationView.tsx | Criar | Historico + envio |
| src/frontend/App.tsx | Modificar | Substituir placeholder por paginas reais |

---

## Task 1: Conversations Service

**Files:**
- Create: src/modules/conversations/conversations.service.ts
- Create: src/modules/conversations/conversations.service.test.ts

- [ ] **1.1 Criar estrutura de diretorios**
```
mkdir -p src/modules/conversations
```

- [ ] **1.2 Escrever testes primeiro**

Criar src/modules/conversations/conversations.service.test.ts:

```typescript
import { test, expect, describe, beforeAll } from 'bun:test';
import { ConversationsService } from './conversations.service';
import { db } from '../../services/db.service';

describe('ConversationsService', () => {
  const phoneId = 'conv-test-phone';
  const contact1 = '5541900000010';
  const contact2 = '5541900000011';

  beforeAll(() => {
    // Popula messages para teste
    db.saveMessage({ id: 'c-msg-1', phone_number_id: phoneId, contact_phone: contact1, direction: 'inbound', type: 'text', content: { text: { body: 'Ola' } } });
    db.saveMessage({ id: 'c-msg-2', phone_number_id: phoneId, contact_phone: contact1, direction: 'outbound', type: 'text', content: { text: { body: 'Tudo bem?' } } });
    db.saveMessage({ id: 'c-msg-3', phone_number_id: phoneId, contact_phone: contact2, direction: 'inbound', type: 'text', content: { text: { body: 'Oi' } } });
  });

  test('listConversations retorna contatos unicos com ultima mensagem', () => {
    const convs = ConversationsService.listConversations(phoneId);
    expect(convs.length).toBeGreaterThanOrEqual(2);
    const phones = convs.map(c => c.contact_phone);
    expect(phones).toContain(contact1);
    expect(phones).toContain(contact2);
  });

  test('getMessages retorna historico em ordem ASC', () => {
    const msgs = ConversationsService.getMessages(phoneId, contact1);
    expect(msgs.length).toBe(2);
    expect(msgs[0].id).toBe('c-msg-1');
    expect(msgs[1].direction).toBe('outbound');
  });

  test('getMessages retorna array vazio para contato inexistente', () => {
    const msgs = ConversationsService.getMessages(phoneId, '5541000000000');
    expect(msgs).toHaveLength(0);
  });
});
```

- [ ] **1.3 Rodar para confirmar falha**
```
bun test src/modules/conversations/conversations.service.test.ts
```

- [ ] **1.4 Criar conversations.service.ts**

```typescript
// src/modules/conversations/conversations.service.ts
import { db, ConversationSummary, Message } from '../../services/db.service';
import { sender } from '../../services/sender.service';

export class ConversationsService {

  static listConversations(phone_number_id: string): ConversationSummary[] {
    return db.listConversations(phone_number_id);
  }

  static getMessages(phone_number_id: string, contact_phone: string): Message[] {
    return db.getMessages(phone_number_id, contact_phone);
  }

  static async sendMessage(params: {
    phone_number_id: string;
    contact_phone: string;
    message: string;
  }): Promise<{ wamid: string }> {
    // sender.send() busca meta_token do DB automaticamente via phone_number_id
    const result = await sender.send({
      phone_number_id: params.phone_number_id,
      to: params.contact_phone,
      type: 'text',
      text: { body: params.message },
    });

    if (!result.success || !result.data?.messages?.[0]?.id) {
      throw new Error(result.error ?? 'Falha ao enviar mensagem via Meta API');
    }

    const wamid = result.data.messages[0].id as string;

    // Salva a mensagem outbound no inbox
    db.saveMessage({
      id: wamid,
      phone_number_id: params.phone_number_id,
      contact_phone: params.contact_phone,
      direction: 'outbound',
      type: 'text',
      content: { text: { body: params.message } },
    });

    return { wamid };
  }
}
```

Nota: `sender` (export de sender.service.ts) resolve o meta_token internamente consultando
o banco via `phone_number_id` — nao e necessario passar token explicitamente.

- [ ] **1.5 Rodar testes**
```
bun test src/modules/conversations/conversations.service.test.ts
```

- [ ] **1.6 Commit**
```
git add src/modules/conversations/
git commit -m "feat(conversations): service com listConversations, getMessages e sendMessage"
```

---

## Task 2: Conversations Controller e Rotas

**Files:**
- Create: src/modules/conversations/conversations.controller.ts
- Create: src/modules/conversations/conversations.routes.ts
- Modify: src/routes/router.ts

- [ ] **2.1 Criar conversations.controller.ts**

```typescript
// src/modules/conversations/conversations.controller.ts
import { ConversationsService } from './conversations.service';
import { db } from '../../services/db.service';

export class ConversationsController {

  static listConversations(phone_number_id: string): Response {
    const convs = ConversationsService.listConversations(phone_number_id);
    return Response.json(convs);
  }

  static getMessages(phone_number_id: string, contact_phone: string): Response {
    const msgs = ConversationsService.getMessages(phone_number_id, contact_phone);
    return Response.json(msgs);
  }

  static async sendMessage(req: Request, phone_number_id: string, contact_phone: string): Promise<Response> {
    const body = await req.json().catch(() => null);
    if (!body?.message || typeof body.message !== 'string') {
      return Response.json({ error: 'Campo message obrigatorio' }, { status: 400 });
    }

    const client = db.getClientByPhoneId(phone_number_id);
    if (!client) {
      return Response.json({ error: 'Conta nao encontrada' }, { status: 404 });
    }

    try {
      const result = await ConversationsService.sendMessage({
        phone_number_id,
        contact_phone,
        message: body.message,
      });
      return Response.json(result);
    } catch (err: any) {
      return Response.json({ error: err.message ?? 'Erro ao enviar mensagem' }, { status: 500 });
    }
  }
}
```

- [ ] **2.2 Criar conversations.routes.ts**

```typescript
// src/modules/conversations/conversations.routes.ts
import { ConversationsController } from './conversations.controller';

// Retorna Response se a rota bate, null caso contrario
export async function conversationsRoutes(req: Request, method: string, pathname: string): Promise<Response | null> {

  // GET /api/v2/conversations/:phone_number_id
  const listMatch = pathname.match(/^\/api\/v2\/conversations\/([^/]+)$/);
  if (method === 'GET' && listMatch) {
    return ConversationsController.listConversations(listMatch[1]);
  }

  // GET /api/v2/conversations/:phone_number_id/:contact
  const msgMatch = pathname.match(/^\/api\/v2\/conversations\/([^/]+)\/([^/]+)$/);
  if (method === 'GET' && msgMatch) {
    return ConversationsController.getMessages(msgMatch[1], decodeURIComponent(msgMatch[2]));
  }

  // POST /api/v2/conversations/:phone_number_id/:contact
  if (method === 'POST' && msgMatch) {
    return ConversationsController.sendMessage(req, msgMatch[1], decodeURIComponent(msgMatch[2]));
  }

  return null;
}
```

- [ ] **2.3 Adicionar rotas conversations no bloco /api/v2/ do router.ts**

Localizar o bloco /api/v2/ em router.ts e adicionar import + chamada:

```typescript
// No topo do router.ts:
import { conversationsRoutes } from '../modules/conversations/conversations.routes';

// Dentro do bloco if (pathname.startsWith('/api/v2/')):
    const conversationsResult = await conversationsRoutes(req, method, pathname);
    if (conversationsResult) return conversationsResult;
```

- [ ] **2.4 Rodar todos os testes**
```
bun test
```

- [ ] **2.5 Commit**
```
git add src/modules/conversations/ src/routes/router.ts
git commit -m "feat(conversations): controller e rotas API /api/v2/conversations"
```

---

## Task 3: Frontend — ConversationList e ConversationView

**Files:**
- Create: src/frontend/pages/conversations/ConversationList.tsx
- Create: src/frontend/pages/conversations/ConversationView.tsx
- Modify: src/frontend/App.tsx

- [ ] **3.1 Criar src/frontend/pages/conversations/ConversationList.tsx**

```tsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
```

- [ ] **3.2 Criar src/frontend/pages/conversations/ConversationView.tsx**

```tsx
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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/v2/conversations/${phoneId}/${encodeURIComponent(contact)}`)
      .then(r => r.json())
      .then(setMessages)
      .catch(() => {});
    const timer = setInterval(() => {
      fetch(`/api/v2/conversations/${phoneId}/${encodeURIComponent(contact)}`)
        .then(r => r.json()).then(setMessages).catch(() => {});
    }, 10000);
    return () => clearInterval(timer);
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
    try {
      await fetch(`/api/v2/conversations/${phoneId}/${encodeURIComponent(contact)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim() }),
      });
      setText('');
      // Recarrega mensagens
      const updated = await fetch(`/api/v2/conversations/${phoneId}/${encodeURIComponent(contact)}`).then(r => r.json());
      setMessages(updated);
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
```

- [ ] **3.3 Atualizar App.tsx para usar paginas reais**

Em src/frontend/App.tsx, substituir:
```tsx
const ConversationList = () => <div className="p-8 text-gray-500">Conversas (plano 2)</div>;
```
Por:
```tsx
import ConversationList from './pages/conversations/ConversationList';
```
E remover o placeholder const.

- [ ] **3.4 Smoke test no browser**
```
bun run src/server.ts
# Acessa /painel/conversas
# Seleciona uma conta
# Deve listar conversas existentes
# Clicar em uma conversa abre o historico
```

- [ ] **3.5 Rodar todos os testes**
```
bun test
```

- [ ] **3.6 Commit**
```
git add src/frontend/pages/conversations/ src/frontend/App.tsx
git commit -m "feat(conversations): paginas ConversationList e ConversationView"
```

---

## Verificacao Final do Plano 2

- [ ] GET /api/v2/conversations/:phone_number_id retorna JSON com lista
- [ ] GET /api/v2/conversations/:phone_number_id/:contact retorna historico
- [ ] POST /api/v2/conversations/:phone_number_id/:contact envia mensagem
- [ ] Frontend exibe inbox estilo duas colunas
- [ ] bun test passa sem regressao

**Proximo:** Plano 3 — Templates

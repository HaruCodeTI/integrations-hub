# Plano 3: Templates — CRUD via Meta Graph API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o modulo de templates: service que chama a Meta Graph API para listar/criar/editar/excluir templates, controller HTTP, rotas /api/v2/templates, e paginas React TemplateList + TemplateForm.

**Architecture:** Templates nao sao armazenados localmente — sempre buscados ao vivo da Meta API v21.0 usando o meta_token do cliente. O service segue o padrao do meta-oauth.service.ts existente (fetch direto para graph.facebook.com). Criacao/edicao requer WABA ID que e obtido via endpoint de conta da Meta.

**Tech Stack:** Bun, Meta Graph API v21.0, React 18, TypeScript, Tailwind CSS

**Pre-requisito:** Plano 1 concluido.

**Spec:** docs/superpowers/specs/2026-03-20-whatsapp-campaign-panel-design.md

---

## Mapa de Arquivos

| Arquivo | Acao | Responsabilidade |
|---|---|---|
| src/modules/templates/templates.service.ts | Criar | Chamadas Meta Graph API |
| src/modules/templates/templates.service.test.ts | Criar | Testes com fetch mockado |
| src/modules/templates/templates.controller.ts | Criar | Handlers HTTP |
| src/modules/templates/templates.routes.ts | Criar | Definicao de rotas |
| src/routes/router.ts | Modificar | Incluir rotas templates |
| src/frontend/pages/templates/TemplateList.tsx | Criar | Lista de templates por conta |
| src/frontend/pages/templates/TemplateForm.tsx | Criar | Formulario criar/editar |
| src/frontend/App.tsx | Modificar | Substituir placeholder |

---

## Task 1: Templates Service

**Files:**
- Create: src/modules/templates/templates.service.ts
- Create: src/modules/templates/templates.service.test.ts

- [ ] **1.1 Criar estrutura de diretorios**
```
mkdir -p src/modules/templates
```

- [ ] **1.2 Estudar estrutura da Meta API para templates**

A Meta Graph API v21.0 para templates usa WABA ID (diferente de phone_number_id):
- GET /{waba_id}/message_templates — lista templates
- POST /{waba_id}/message_templates — cria template
- PUT /{template_id} — edita template (apenas nome e category)
- DELETE /{waba_id}/message_templates?name={name} — exclui

Para obter o WABA ID a partir do phone_number_id, usamos:
- GET /{phone_number_id}?fields=whatsapp_business_account — retorna o WABA

Essa logica deve estar encapsulada no service.

- [ ] **1.3 Escrever testes com fetch mockado**

Criar src/modules/templates/templates.service.test.ts:

```typescript
import { test, expect, describe, mock, beforeEach } from 'bun:test';

// Mockar fetch antes de importar o service
const mockFetch = mock(() =>
  Promise.resolve(new Response(JSON.stringify({ data: [], id: 'waba-123' })))
);
global.fetch = mockFetch as any;

import { TemplatesService } from './templates.service';

describe('TemplatesService', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  test('getWabaId chama endpoint correto', async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ whatsapp_business_account: { id: 'waba-abc' } })))
    );
    const wabaId = await TemplatesService.getWabaId('phone-123', 'token-test');
    expect(wabaId).toBe('waba-abc');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('phone-123'),
      expect.any(Object)
    );
  });

  test('listTemplates retorna array da Meta', async () => {
    mockFetch
      .mockImplementationOnce(() =>
        Promise.resolve(new Response(JSON.stringify({ whatsapp_business_account: { id: 'waba-abc' } })))
      )
      .mockImplementationOnce(() =>
        Promise.resolve(new Response(JSON.stringify({ data: [{ name: 'promo', status: 'APPROVED' }] })))
      );
    const templates = await TemplatesService.listTemplates('phone-123', 'token-test');
    expect(templates).toHaveLength(1);
    expect(templates[0].name).toBe('promo');
  });

  test('listTemplates lanca erro se Meta retornar erro', async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ error: { message: 'Invalid token' } }), { status: 400 }))
    );
    await expect(TemplatesService.getWabaId('phone-123', 'bad-token')).rejects.toThrow();
  });
});
```

- [ ] **1.4 Rodar para confirmar falha**
```
bun test src/modules/templates/templates.service.test.ts
```

- [ ] **1.5 Criar templates.service.ts**

```typescript
// src/modules/templates/templates.service.ts

const GRAPH_URL = 'https://graph.facebook.com/v21.0';

export interface MetaTemplate {
  id?: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components?: object[];
}

export interface CreateTemplateInput {
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  components: object[];
}

async function graphRequest(url: string, token: string, options?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });
  const data = await res.json() as any;
  if (data.error) throw new Error(data.error.message ?? 'Erro na Meta API');
  return data;
}

export class TemplatesService {

  static async getWabaId(phone_number_id: string, token: string): Promise<string> {
    const data = await graphRequest(
      `${GRAPH_URL}/${phone_number_id}?fields=whatsapp_business_account`,
      token
    );
    const wabaId = data.whatsapp_business_account?.id;
    if (!wabaId) throw new Error('WABA ID nao encontrado para esse phone_number_id');
    return wabaId;
  }

  static async listTemplates(phone_number_id: string, token: string): Promise<MetaTemplate[]> {
    const wabaId = await TemplatesService.getWabaId(phone_number_id, token);
    const data = await graphRequest(
      `${GRAPH_URL}/${wabaId}/message_templates?fields=id,name,status,category,language,components&limit=100`,
      token
    );
    return data.data ?? [];
  }

  static async createTemplate(
    phone_number_id: string,
    token: string,
    input: CreateTemplateInput
  ): Promise<{ id: string }> {
    const wabaId = await TemplatesService.getWabaId(phone_number_id, token);
    const data = await graphRequest(`${GRAPH_URL}/${wabaId}/message_templates`, token, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return { id: data.id };
  }

  static async deleteTemplate(
    phone_number_id: string,
    token: string,
    name: string
  ): Promise<void> {
    const wabaId = await TemplatesService.getWabaId(phone_number_id, token);
    await graphRequest(
      `${GRAPH_URL}/${wabaId}/message_templates?name=${encodeURIComponent(name)}`,
      token,
      { method: 'DELETE' }
    );
  }
}
```

- [ ] **1.6 Rodar testes**
```
bun test src/modules/templates/templates.service.test.ts
```

- [ ] **1.7 Commit**
```
git add src/modules/templates/
git commit -m "feat(templates): service com getWabaId, listTemplates, createTemplate, deleteTemplate"
```

---

## Task 2: Templates Controller e Rotas

**Files:**
- Create: src/modules/templates/templates.controller.ts
- Create: src/modules/templates/templates.routes.ts
- Modify: src/routes/router.ts

- [ ] **2.1 Criar templates.controller.ts**

```typescript
// src/modules/templates/templates.controller.ts
import { TemplatesService } from './templates.service';
import { db } from '../../services/db.service';

function getClient(phone_number_id: string): { meta_token: string } | null {
  return db.getClientByPhoneId(phone_number_id);
}

export class TemplatesController {

  static async listTemplates(phone_number_id: string): Promise<Response> {
    const client = getClient(phone_number_id);
    if (!client) return Response.json({ error: 'Conta nao encontrada' }, { status: 404 });
    try {
      const templates = await TemplatesService.listTemplates(phone_number_id, client.meta_token);
      return Response.json(templates);
    } catch (err: any) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  static async createTemplate(req: Request, phone_number_id: string): Promise<Response> {
    const client = getClient(phone_number_id);
    if (!client) return Response.json({ error: 'Conta nao encontrada' }, { status: 404 });
    const body = await req.json().catch(() => null);
    if (!body?.name || !body?.category || !body?.language || !body?.components) {
      return Response.json({ error: 'Campos obrigatorios: name, category, language, components' }, { status: 400 });
    }
    try {
      const result = await TemplatesService.createTemplate(phone_number_id, client.meta_token, body);
      return Response.json(result, { status: 201 });
    } catch (err: any) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  static async deleteTemplate(phone_number_id: string, name: string): Promise<Response> {
    const client = getClient(phone_number_id);
    if (!client) return Response.json({ error: 'Conta nao encontrada' }, { status: 404 });
    try {
      await TemplatesService.deleteTemplate(phone_number_id, client.meta_token, name);
      return Response.json({ ok: true });
    } catch (err: any) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }
}
```

- [ ] **2.2 Criar templates.routes.ts**

```typescript
// src/modules/templates/templates.routes.ts
import { TemplatesController } from './templates.controller';

export async function templatesRoutes(req: Request, method: string, pathname: string): Promise<Response | null> {

  // GET /api/v2/templates/:phone_number_id
  // POST /api/v2/templates/:phone_number_id
  const listMatch = pathname.match(/^\/api\/v2\/templates\/([^/]+)$/);
  if (listMatch) {
    if (method === 'GET') return TemplatesController.listTemplates(listMatch[1]);
    if (method === 'POST') return TemplatesController.createTemplate(req, listMatch[1]);
  }

  // DELETE /api/v2/templates/:phone_number_id/:name
  const nameMatch = pathname.match(/^\/api\/v2\/templates\/([^/]+)\/([^/]+)$/);
  if (nameMatch) {
    if (method === 'DELETE') return TemplatesController.deleteTemplate(nameMatch[1], decodeURIComponent(nameMatch[2]));
  }

  return null;
}
```

- [ ] **2.3 Adicionar templates no bloco /api/v2/ do router.ts**

```typescript
// No topo:
import { templatesRoutes } from '../modules/templates/templates.routes';

// Dentro do bloco /api/v2/:
    const templatesResult = await templatesRoutes(req, method, pathname);
    if (templatesResult) return templatesResult;
```

- [ ] **2.4 Rodar testes**
```
bun test
```

- [ ] **2.5 Commit**
```
git add src/modules/templates/ src/routes/router.ts
git commit -m "feat(templates): controller e rotas API /api/v2/templates"
```

---

## Task 3: Frontend — TemplateList e TemplateForm

**Files:**
- Create: src/frontend/pages/templates/TemplateList.tsx
- Create: src/frontend/pages/templates/TemplateForm.tsx
- Modify: src/frontend/App.tsx

- [ ] **3.1 Criar src/frontend/pages/templates/TemplateList.tsx**

```tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AccountSelector from '../../components/AccountSelector';
import StatusBadge from '../../components/StatusBadge';

interface Template {
  id?: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components?: any[];
}

const CATEGORY_ICONS: Record<string, string> = {
  MARKETING: '📢', UTILITY: '⚙️', AUTHENTICATION: '🔒',
};

export default function TemplateList() {
  const navigate = useNavigate();
  const [phoneId, setPhoneId] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  function load(pid: string) {
    if (!pid) return;
    setLoading(true);
    fetch(`/api/v2/templates/${pid}`)
      .then(r => r.json())
      .then(data => { setTemplates(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load(phoneId); }, [phoneId]);

  async function handleDelete(name: string) {
    if (!confirm(`Excluir template "${name}"?`)) return;
    setDeleting(name);
    await fetch(`/api/v2/templates/${phoneId}/${encodeURIComponent(name)}`, { method: 'DELETE' });
    setDeleting(null);
    load(phoneId);
  }

  function getBodyPreview(components: any[] = []): string {
    const body = components.find(c => c.type === 'BODY');
    return body?.text ?? '';
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Templates</h1>
          <p className="text-sm text-gray-500">Gerencie templates de mensagem da Meta API</p>
        </div>
        {phoneId && (
          <button
            onClick={() => navigate(`/painel/templates/novo?phone=${phoneId}`)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium"
          >
            + Novo Template
          </button>
        )}
      </div>

      <div className="mb-4 max-w-xs">
        <AccountSelector value={phoneId} onChange={setPhoneId} label="Conta" />
      </div>

      {loading && <div className="text-sm text-gray-400">Buscando templates...</div>}

      {!loading && templates.length === 0 && phoneId && (
        <div className="text-sm text-gray-400">Nenhum template encontrado.</div>
      )}

      <div className="space-y-3">
        {templates.map(t => (
          <div key={t.name} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{CATEGORY_ICONS[t.category] ?? '📋'}</span>
                <span className="font-medium text-sm">{t.name}</span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{t.category}</span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{t.language}</span>
                <StatusBadge status={t.status} />
              </div>
              <p className="text-sm text-gray-500 line-clamp-2">{getBodyPreview(t.components)}</p>
            </div>
            <button
              onClick={() => handleDelete(t.name)}
              disabled={deleting === t.name}
              className="ml-4 text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
            >
              {deleting === t.name ? '...' : 'Excluir'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **3.2 Criar src/frontend/pages/templates/TemplateForm.tsx**

```tsx
import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function TemplateForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const phoneId = searchParams.get('phone') ?? '';

  const [form, setForm] = useState({
    name: '',
    category: 'MARKETING',
    language: 'pt_BR',
    headerText: '',
    body: '',
    footer: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Extrai variaveis {{1}} {{2}} do body
  const bodyVars = Array.from(new Set((form.body.match(/\{\{\d+\}\}/g) ?? [])));

  const [examples, setExamples] = useState<Record<string, string>>({});

  function setField(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.name || !form.body) { setError('Nome e corpo sao obrigatorios'); return; }
    if (!phoneId) { setError('Selecione uma conta'); return; }

    const components: object[] = [];
    if (form.headerText) components.push({ type: 'HEADER', format: 'TEXT', text: form.headerText });
    components.push({
      type: 'BODY',
      text: form.body,
      ...(bodyVars.length > 0 ? {
        example: { body_text: [bodyVars.map(v => examples[v] ?? v)] }
      } : {}),
    });
    if (form.footer) components.push({ type: 'FOOTER', text: form.footer });

    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/v2/templates/${phoneId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          language: form.language,
          components,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao criar');
      navigate(`/painel/templates?phone=${phoneId}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Novo Template</h1>
        <p className="text-sm text-gray-500">Configure a mensagem para aprovacao da Meta</p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
          <div className="flex gap-3">
            {['MARKETING', 'UTILITY', 'AUTHENTICATION'].map(c => (
              <button key={c} onClick={() => setField('category', c)}
                className={`flex-1 py-2 px-3 border rounded-lg text-sm font-medium ${form.category === c ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
                {c === 'MARKETING' ? 'Marketing' : c === 'UTILITY' ? 'Utilidade' : 'Autenticacao'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Template *</label>
          <input type="text" value={form.name} onChange={e => setField('name', e.target.value.toLowerCase().replace(/\s+/g, '_'))}
            placeholder="ex: promocao_verao_2026"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <p className="text-xs text-gray-400 mt-1">Apenas letras minusculas, numeros e underscores</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Idioma</label>
          <select value={form.language} onChange={e => setField('language', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="pt_BR">Portugues (Brasil)</option>
            <option value="en_US">Ingles (EUA)</option>
            <option value="es">Espanhol</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cabecalho (opcional)</label>
          <input type="text" value={form.headerText} onChange={e => setField('headerText', e.target.value)}
            placeholder="Texto do cabecalho"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Corpo da Mensagem *</label>
          <textarea value={form.body} onChange={e => setField('body', e.target.value)} rows={4}
            placeholder="Ola, {{1}}, confira nossa promocao!"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <p className="text-xs text-gray-400 mt-1">Use {{`{{1}}`}} {{`{{2}}`}} para variaveis dinamicas</p>
        </div>

        {bodyVars.length > 0 && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-xs font-medium text-yellow-800 mb-2">Exemplos das Variaveis (obrigatorio pela Meta)</p>
            {bodyVars.map(v => (
              <div key={v} className="flex items-center gap-2 mb-1">
                <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded font-mono">{v}</span>
                <input type="text" placeholder={`Exemplo para ${v}`} value={examples[v] ?? ''}
                  onChange={e => setExamples(prev => ({ ...prev, [v]: e.target.value }))}
                  className="flex-1 border border-yellow-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-yellow-400" />
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Rodape (opcional)</label>
          <input type="text" value={form.footer} onChange={e => setField('footer', e.target.value)}
            placeholder="Enviado por HaruCode"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* Preview */}
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
          <p className="text-xs font-medium text-gray-500 mb-2">Pre-visualizacao</p>
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 max-w-xs">
            {form.headerText && <p className="font-semibold text-sm mb-1">{form.headerText}</p>}
            <p className="text-sm">{form.body || 'Corpo da mensagem...'}</p>
            {form.footer && <p className="text-xs text-gray-400 mt-1">{form.footer}</p>}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={() => navigate(-1)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? 'Enviando...' : 'Enviar para Aprovacao'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **3.3 Atualizar App.tsx**

Substituir o placeholder de templates:
```tsx
// Remover:
const TemplateList = () => <div className="p-8 text-gray-500">Templates (plano 3)</div>;

// Adicionar imports:
import TemplateList from './pages/templates/TemplateList';
import TemplateForm from './pages/templates/TemplateForm';
```

Atualizar a rota no JSX:
```tsx
<Route path="templates" element={<TemplateList />} />
<Route path="templates/novo" element={<TemplateForm />} />
```

- [ ] **3.4 Smoke test no browser**
```
bun run src/server.ts
# Acessa /painel/templates
# Seleciona conta e verifica que lista templates da Meta
# Clica em "Novo Template" e verifica formulario
```

- [ ] **3.5 Rodar todos os testes**
```
bun test
```

- [ ] **3.6 Commit**
```
git add src/frontend/pages/templates/ src/frontend/App.tsx
git commit -m "feat(templates): paginas TemplateList e TemplateForm"
```

---

## Verificacao Final do Plano 3

- [ ] GET /api/v2/templates/:phone_number_id retorna templates da Meta
- [ ] POST /api/v2/templates/:phone_number_id cria e submete para aprovacao
- [ ] DELETE /api/v2/templates/:phone_number_id/:name exclui template
- [ ] Frontend exibe lista com status e preview do corpo
- [ ] Formulario tem preview em tempo real e campos de exemplo de variaveis
- [ ] bun test passa sem regressao

**Proximo:** Plano 4 — Campaigns

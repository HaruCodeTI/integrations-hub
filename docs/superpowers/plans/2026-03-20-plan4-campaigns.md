# Plano 4: Campaigns — Disparos em Massa com Worker e UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o modulo completo de campanhas: service de criacao + parsing CSV/XLSX, worker de fila persistente com delay e rate limit, rotas API, e paginas React CampaignList + CampaignWizard (3 etapas) + CampaignDetail.

**Architecture:** O worker roda em setInterval(5s) no mesmo processo Bun. Ele processa jobs da tabela campaign_jobs em transacoes SQLite atomicas. O parser CSV e nativo, XLSX usa o pacote xlsx instalado no Plano 1. O wizard e um componente de 3 etapas com estado local — nenhum dado e salvo no servidor ate o usuario confirmar.

**Tech Stack:** Bun, SQLite, React 18, TypeScript, Tailwind CSS, xlsx (npm)

**Pre-requisito:** Planos 1, 3 concluidos (DB + tabelas + templates service para listar templates no wizard).

**Spec:** docs/superpowers/specs/2026-03-20-whatsapp-campaign-panel-design.md

---

## Mapa de Arquivos

| Arquivo | Acao | Responsabilidade |
|---|---|---|
| src/modules/campaigns/campaigns.service.ts | Criar | Criacao de campanha + parsing CSV/XLSX |
| src/modules/campaigns/campaigns.service.test.ts | Criar | Testes de parsing e criacao |
| src/modules/campaigns/campaigns.worker.ts | Criar | Worker de fila persistente |
| src/modules/campaigns/campaigns.worker.test.ts | Criar | Testes do worker |
| src/modules/campaigns/campaigns.controller.ts | Criar | Handlers HTTP |
| src/modules/campaigns/campaigns.routes.ts | Criar | Definicao de rotas |
| src/routes/router.ts | Modificar | Incluir rotas campaigns |
| src/server.ts | Modificar | Iniciar worker |
| src/frontend/pages/campaigns/CampaignList.tsx | Criar | Lista de campanhas |
| src/frontend/pages/campaigns/CampaignWizard.tsx | Criar | Wizard 3 etapas |
| src/frontend/pages/campaigns/CampaignDetail.tsx | Criar | Metricas + contatos |
| src/frontend/App.tsx | Modificar | Substituir placeholder |

---

## Task 1: Campaign Service — parsing e criacao

**Files:**
- Create: src/modules/campaigns/campaigns.service.ts
- Create: src/modules/campaigns/campaigns.service.test.ts

- [ ] **1.1 Criar estrutura de diretorios**
```
mkdir -p src/modules/campaigns
```

- [ ] **1.2 Escrever testes de parsing**

Criar src/modules/campaigns/campaigns.service.test.ts:

```typescript
import { test, expect, describe } from 'bun:test';
import { CampaignsService } from './campaigns.service';

describe('CampaignsService.parseCSV', () => {
  test('parseia CSV simples com telefone e nome', () => {
    const csv = 'telefone,nome\n5541900000001,Ana\n5541900000002,Bob';
    const result = CampaignsService.parseCSV(csv);
    expect(result.contacts).toHaveLength(2);
    expect(result.columns).toContain('nome');
    expect(result.contacts[0].phone).toBe('5541900000001');
    expect(result.contacts[0].variables).toEqual({ nome: 'Ana' });
  });

  test('lanca erro se coluna telefone ausente', () => {
    const csv = 'nome,email\nAna,ana@test.com';
    expect(() => CampaignsService.parseCSV(csv)).toThrow('telefone');
  });

  test('remove duplicatas de telefone', () => {
    const csv = 'telefone,nome\n5541900000001,Ana\n5541900000001,Ana2';
    const result = CampaignsService.parseCSV(csv);
    expect(result.contacts).toHaveLength(1);
  });

  test('remove linhas sem telefone', () => {
    const csv = 'telefone,nome\n5541900000001,Ana\n,Bob';
    const result = CampaignsService.parseCSV(csv);
    expect(result.contacts).toHaveLength(1);
  });

  test('limita a 10000 contatos', () => {
    const rows = Array.from({ length: 10005 }, (_, i) => `554100000${String(i).padStart(4, '0')},Nome${i}`);
    const csv = 'telefone,nome\n' + rows.join('\n');
    const result = CampaignsService.parseCSV(csv);
    expect(result.contacts).toHaveLength(10000);
  });
});

describe('CampaignsService.applyMapping', () => {
  test('substitui variaveis com valores do contato', () => {
    const variables = { nome: 'Ana', cidade: 'Curitiba' };
    const mapping = { '{{1}}': 'nome', '{{2}}': 'cidade' };
    const result = CampaignsService.applyMapping(variables, mapping);
    expect(result).toEqual([{ type: 'text', text: 'Ana' }, { type: 'text', text: 'Curitiba' }]);
  });
});
```

- [ ] **1.3 Rodar para confirmar falha**
```
bun test src/modules/campaigns/campaigns.service.test.ts
```

- [ ] **1.4 Criar campaigns.service.ts**

```typescript
// src/modules/campaigns/campaigns.service.ts
import * as XLSX from 'xlsx';
import { db, Campaign, CampaignContact } from '../../services/db.service';

interface ParseResult {
  contacts: Array<{ phone: string; variables: Record<string, string> }>;
  columns: string[];
}

export class CampaignsService {

  static parseCSV(csv: string): ParseResult {
    const lines = csv.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error('CSV deve ter cabecalho e pelo menos 1 linha de dados');

    const columns = lines[0].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const phoneIndex = columns.indexOf('telefone');
    if (phoneIndex === -1) throw new Error('Coluna "telefone" e obrigatoria');

    const seen = new Set<string>();
    const contacts: ParseResult['contacts'] = [];

    for (const line of lines.slice(1)) {
      if (contacts.length >= 10000) break;
      const cells = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      const phone = cells[phoneIndex]?.replace(/\D/g, '');
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);

      const variables: Record<string, string> = {};
      columns.forEach((col, idx) => {
        if (col !== 'telefone') variables[col] = cells[idx] ?? '';
      });
      contacts.push({ phone, variables });
    }

    return { contacts, columns: columns.filter(c => c !== 'telefone') };
  }

  static parseXLSX(buffer: ArrayBuffer): ParseResult {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_csv(sheet);
    return CampaignsService.parseCSV(rows);
  }

  static applyMapping(
    variables: Record<string, string>,
    mapping: Record<string, string>
  ): Array<{ type: 'text'; text: string }> {
    return Object.entries(mapping).map(([, column]) => ({
      type: 'text' as const,
      text: variables[column] ?? '',
    }));
  }

  static async createCampaign(params: {
    name: string;
    phone_number_id: string;
    template_name: string;
    template_language: string;
    variable_mapping: Record<string, string>;
    contacts: Array<{ phone: string; variables: Record<string, string> }>;
    scheduled_at?: string;
    delay_seconds?: number;
    meta_tier?: number;
  }): Promise<Campaign> {
    // db.createCampaign define status automaticamente:
    // scheduled_at preenchido → 'pending'; sem scheduled_at → 'running'
    // Worker so processa campanhas com status 'running' e scheduled_at <= agora
    const campaign = db.createCampaign({
      name: params.name,
      phone_number_id: params.phone_number_id,
      template_name: params.template_name,
      template_language: params.template_language,
      variable_mapping: params.variable_mapping,
      scheduled_at: params.scheduled_at,
      delay_seconds: params.delay_seconds ?? 3,
      meta_tier: params.meta_tier ?? 1,
      total_contacts: params.contacts.length,
    });

    db.insertCampaignContacts(campaign.id, params.contacts);

    const contactIds = db.listCampaignContacts(campaign.id).map(c => c.id);
    db.insertCampaignJobs(campaign.id, contactIds);

    return campaign;
  }

  static getTierLimit(tier: number): number {
    const limits: Record<number, number> = { 1: 1000, 2: 10000, 3: 100000 };
    return limits[tier] ?? 1000;
  }
}
```

- [ ] **1.5 Rodar testes**
```
bun test src/modules/campaigns/campaigns.service.test.ts
```

- [ ] **1.6 Commit**
```
git add src/modules/campaigns/campaigns.service.ts src/modules/campaigns/campaigns.service.test.ts
git commit -m "feat(campaigns): service com parseCSV, parseXLSX, applyMapping e createCampaign"
```

---

## Task 2: Campaign Worker

**Files:**
- Create: src/modules/campaigns/campaigns.worker.ts
- Create: src/modules/campaigns/campaigns.worker.test.ts

- [ ] **2.1 Estudar sender.service.ts antes de implementar**

Verificar a assinatura de sendTemplate em src/services/sender.service.ts para entender como enviar mensagens de template via Meta API. O worker precisa:
- phone_number_id
- to (numero do contato)
- template_name + language
- components (array de variaveis resolvidas)
- token (meta_token do cliente)

- [ ] **2.2 Escrever testes do worker**

Criar src/modules/campaigns/campaigns.worker.test.ts:

```typescript
import { test, expect, describe, mock } from 'bun:test';
import { CampaignsService } from './campaigns.service';

describe('CampaignsService helpers', () => {
  test('getTierLimit retorna limites corretos', () => {
    expect(CampaignsService.getTierLimit(1)).toBe(1000);
    expect(CampaignsService.getTierLimit(2)).toBe(10000);
    expect(CampaignsService.getTierLimit(3)).toBe(100000);
    expect(CampaignsService.getTierLimit(99)).toBe(1000); // fallback
  });
});

describe('Worker integration (sem envio real)', () => {
  test('campanha cancelled nao e processada pelo worker', async () => {
    // O worker pula campanhas que nao estao em status 'running'
    // Esse teste verifica que db.getRunningCampaigns() nao retorna cancelled
    const { db } = await import('../../services/db.service');
    const c = db.createCampaign({
      name: 'Worker Test Cancel',
      phone_number_id: 'wt-phone',
      template_name: 't', template_language: 'pt_BR',
      variable_mapping: {}, total_contacts: 0,
    });
    db.updateCampaignStatus(c.id, 'cancelled');
    const running = db.getRunningCampaigns();
    const found = running.find(r => r.id === c.id);
    expect(found).toBeUndefined();
  });

  test('campanha agendada no futuro nao aparece em getRunningCampaigns', async () => {
    const { db } = await import('../../services/db.service');
    const c = db.createCampaign({
      name: 'Worker Test Scheduled',
      phone_number_id: 'wt-phone2',
      template_name: 't', template_language: 'pt_BR',
      variable_mapping: {}, total_contacts: 0,
      scheduled_at: '2099-12-31T23:59:59Z',
    });
    const running = db.getRunningCampaigns();
    expect(running.find(r => r.id === c.id)).toBeUndefined();
  });
});
```

- [ ] **2.3 Rodar para confirmar que passam (logica esta no DB)**
```
bun test src/modules/campaigns/campaigns.worker.test.ts
```

- [ ] **2.4 Criar campaigns.worker.ts**

```typescript
// src/modules/campaigns/campaigns.worker.ts
import { db } from '../../services/db.service';
import { CampaignsService } from './campaigns.service';

const POLL_INTERVAL_MS = 5000;

// sender.send() suporta type: 'template' nativamente.
// Nao e necessario sendTemplate separado — o SenderService busca meta_token do DB.
import { sender } from '../../services/sender.service';

async function processJob(campaignId: string): Promise<void> {
  const campaign = db.getCampaign(campaignId);
  if (!campaign) return;

  const client = db.getClientByPhoneId(campaign.phone_number_id);
  if (!client) {
    db.updateCampaignStatus(campaignId, 'cancelled');
    return;
  }

  // Verifica rate limit do tier
  const sentToday = db.countSentToday(campaign.phone_number_id);
  const limit = CampaignsService.getTierLimit(campaign.meta_tier);
  if (sentToday >= limit) {
    console.log(`[Worker] Rate limit (${limit}/dia) atingido para ${campaign.phone_number_id}. Aguardando.`);
    return;
  }

  // Pega proximo job na fila
  const job = db.getNextJob(campaignId);
  if (!job) {
    // Sem mais jobs queued — verifica se campanha pode ser concluida
    const active = db.countActiveJobs(campaignId);
    if (active === 0) {
      db.updateCampaignStatus(campaignId, 'done');
      console.log(`[Worker] Campanha ${campaignId} concluida.`);
    }
    return;
  }

  const contact = db.getCampaignContact(job.contact_id);
  if (!contact) {
    db.updateJobStatus(job.id, 'failed');
    return;
  }

  db.updateJobStatus(job.id, 'processing');

  const variableMapping = JSON.parse(campaign.variable_mapping) as Record<string, string>;
  const contactVariables = JSON.parse(contact.variables) as Record<string, string>;
  const components = CampaignsService.applyMapping(contactVariables, variableMapping);

  try {
    // sender.send() com type: 'template' — meta_token resolvido internamente pelo SenderService
    const result = await sender.send({
      phone_number_id: campaign.phone_number_id,
      to: contact.phone,
      type: 'template',
      template: {
        name: campaign.template_name,
        language: { code: campaign.template_language },
        components: components.length > 0 ? [{ type: 'body', parameters: components }] : undefined,
      },
    });

    if (!result.success) throw new Error(result.error ?? 'Falha ao enviar template');
    const wamid = result.data?.messages?.[0]?.id as string | undefined;
    if (!wamid) throw new Error('Resposta da Meta sem wamid');

    db.markJobDone(job.id, contact.id, wamid);
    console.log(`[Worker] Enviado para ${contact.phone} — wamid: ${wamid}`);
  } catch (err: any) {
    const newAttempts = job.attempts + 1;
    console.warn(`[Worker] Falha ao enviar para ${contact.phone} (tentativa ${newAttempts}): ${err.message}`);

    if (newAttempts >= 3) {
      db.markJobFailed(job.id, contact.id, err.code, err.message);
      console.warn(`[Worker] Contato ${contact.phone} marcado como failed apos ${newAttempts} tentativas.`);
    } else {
      const backoffSeconds = newAttempts === 1 ? 60 : 300;
      const nextAt = new Date(Date.now() + backoffSeconds * 1000).toISOString().replace('T', ' ').substring(0, 19);
      db.updateJobStatus(job.id, 'queued', newAttempts, nextAt);
    }
    return; // Nao aplica delay quando falhou
  }

  // Delay anti-ban entre mensagens
  if (campaign.delay_seconds > 0) {
    await new Promise(resolve => setTimeout(resolve, campaign.delay_seconds * 1000));
  }
}

export function startCampaignWorker(): void {
  console.log('[Worker] Campaign worker iniciado (poll a cada 5s).');

  setInterval(async () => {
    try {
      const campaigns = db.getRunningCampaigns();
      for (const campaign of campaigns) {
        await processJob(campaign.id);
      }
    } catch (err) {
      console.error('[Worker] Erro no loop principal:', err);
    }
  }, POLL_INTERVAL_MS);
}
```

- [ ] **2.5 Rodar todos os testes**
```
bun test
```

- [ ] **2.6 Commit**
```
git add src/modules/campaigns/campaigns.worker.ts src/modules/campaigns/campaigns.worker.test.ts
git commit -m "feat(campaigns): worker de fila persistente com delay e rate limit por tier"
```

---

## Task 3: Campaign Controller, Rotas e Inicio do Worker

**Files:**
- Create: src/modules/campaigns/campaigns.controller.ts
- Create: src/modules/campaigns/campaigns.routes.ts
- Modify: src/routes/router.ts
- Modify: src/server.ts

- [ ] **3.1 Criar campaigns.controller.ts**

```typescript
// src/modules/campaigns/campaigns.controller.ts
import { CampaignsService } from './campaigns.service';
import { db } from '../../services/db.service';

export class CampaignsController {

  static listCampaigns(url: URL): Response {
    const status = url.searchParams.get('status') ?? undefined;
    const campaigns = db.listCampaigns(status);
    // Enriquece com metricas resumidas
    const enriched = campaigns.map(c => ({
      ...c,
      metrics: db.getCampaignMetrics(c.id),
    }));
    return Response.json(enriched);
  }

  static async createCampaign(req: Request): Promise<Response> {
    const contentType = req.headers.get('content-type') ?? '';

    let name: string, phone_number_id: string, template_name: string,
      template_language: string, variable_mapping: Record<string, string>,
      scheduled_at: string | undefined, delay_seconds: number, meta_tier: number,
      fileContent: string | ArrayBuffer | undefined, fileType: 'csv' | 'xlsx' | undefined;

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      name = form.get('name') as string;
      phone_number_id = form.get('phone_number_id') as string;
      template_name = form.get('template_name') as string;
      template_language = form.get('template_language') as string;
      variable_mapping = JSON.parse(form.get('variable_mapping') as string ?? '{}');
      scheduled_at = (form.get('scheduled_at') as string) || undefined;
      delay_seconds = parseInt(form.get('delay_seconds') as string ?? '3');
      meta_tier = parseInt(form.get('meta_tier') as string ?? '1');

      const file = form.get('file') as File | null;
      if (!file) return Response.json({ error: 'Arquivo CSV/XLSX obrigatorio' }, { status: 400 });
      const fname = file.name.toLowerCase();
      fileType = fname.endsWith('.xlsx') || fname.endsWith('.xls') ? 'xlsx' : 'csv';
      fileContent = fileType === 'xlsx' ? await file.arrayBuffer() : await file.text();
    } else {
      return Response.json({ error: 'Content-Type deve ser multipart/form-data' }, { status: 400 });
    }

    if (!name || !phone_number_id || !template_name || !template_language) {
      return Response.json({ error: 'Campos obrigatorios: name, phone_number_id, template_name, template_language' }, { status: 400 });
    }

    try {
      const parsed = fileType === 'xlsx'
        ? CampaignsService.parseXLSX(fileContent as ArrayBuffer)
        : CampaignsService.parseCSV(fileContent as string);

      const campaign = await CampaignsService.createCampaign({
        name, phone_number_id, template_name, template_language,
        variable_mapping, contacts: parsed.contacts,
        scheduled_at, delay_seconds, meta_tier,
      });

      return Response.json(campaign, { status: 201 });
    } catch (err: any) {
      return Response.json({ error: err.message }, { status: 400 });
    }
  }

  static getCampaign(id: string): Response {
    const campaign = db.getCampaign(id);
    if (!campaign) return Response.json({ error: 'Campanha nao encontrada' }, { status: 404 });
    return Response.json({ ...campaign, metrics: db.getCampaignMetrics(id) });
  }

  static pauseCampaign(id: string): Response {
    const c = db.getCampaign(id);
    if (!c) return Response.json({ error: 'Campanha nao encontrada' }, { status: 404 });
    if (c.status !== 'running') return Response.json({ error: 'Apenas campanhas em andamento podem ser pausadas' }, { status: 400 });
    db.updateCampaignStatus(id, 'paused');
    return Response.json({ ok: true });
  }

  static resumeCampaign(id: string): Response {
    const c = db.getCampaign(id);
    if (!c) return Response.json({ error: 'Campanha nao encontrada' }, { status: 404 });
    if (c.status !== 'paused') return Response.json({ error: 'Apenas campanhas pausadas podem ser retomadas' }, { status: 400 });
    db.updateCampaignStatus(id, 'running');
    return Response.json({ ok: true });
  }

  static cancelCampaign(id: string): Response {
    const c = db.getCampaign(id);
    if (!c) return Response.json({ error: 'Campanha nao encontrada' }, { status: 404 });
    if (c.status === 'done' || c.status === 'cancelled') {
      return Response.json({ error: 'Campanha ja finalizada' }, { status: 400 });
    }
    db.updateCampaignStatus(id, 'cancelled');
    db.cancelCampaignContacts(id);
    db.cancelJobsForCampaign(id);
    return Response.json({ ok: true });
  }

  static listContacts(id: string, url: URL): Response {
    const status = url.searchParams.get('status') ?? undefined;
    const page = parseInt(url.searchParams.get('page') ?? '1');
    const contacts = db.listCampaignContacts(id, status, page, 50);
    return Response.json(contacts);
  }

  // parseFile e implementado em Task 5 (wizard frontend)
  // A assinatura e declarada aqui para que campaigns.routes.ts ja possa referenciar o handler
  static async parseFile(_req: Request): Promise<Response> {
    return Response.json({ error: 'Nao implementado ainda' }, { status: 501 });
  }
}
```

- [ ] **3.2 Criar campaigns.routes.ts**

```typescript
// src/modules/campaigns/campaigns.routes.ts
import { CampaignsController } from './campaigns.controller';

export async function campaignsRoutes(req: Request, method: string, pathname: string, url: URL): Promise<Response | null> {

  // POST /api/v2/campaigns/parse — preview CSV/XLSX antes de criar campanha (Task 5)
  if (method === 'POST' && pathname === '/api/v2/campaigns/parse') {
    return CampaignsController.parseFile(req);
  }

  // GET/POST /api/v2/campaigns
  if (pathname === '/api/v2/campaigns') {
    if (method === 'GET') return CampaignsController.listCampaigns(url);
    if (method === 'POST') return CampaignsController.createCampaign(req);
  }

  // GET /api/v2/campaigns/:id
  const idMatch = pathname.match(/^\/api\/v2\/campaigns\/([^/]+)$/);
  if (idMatch) {
    if (method === 'GET') return CampaignsController.getCampaign(idMatch[1]);
  }

  // PATCH /api/v2/campaigns/:id/pause|resume
  // DELETE /api/v2/campaigns/:id
  const actionMatch = pathname.match(/^\/api\/v2\/campaigns\/([^/]+)\/(pause|resume|contacts)$/);
  if (actionMatch) {
    const [, id, action] = actionMatch;
    if (method === 'PATCH' && action === 'pause') return CampaignsController.pauseCampaign(id);
    if (method === 'PATCH' && action === 'resume') return CampaignsController.resumeCampaign(id);
    if (method === 'GET' && action === 'contacts') return CampaignsController.listContacts(id, url);
  }

  // DELETE /api/v2/campaigns/:id
  if (idMatch && method === 'DELETE') return CampaignsController.cancelCampaign(idMatch[1]);

  return null;
}
```

- [ ] **3.3 Adicionar rotas campaigns no router.ts**

```typescript
// No topo:
import { campaignsRoutes } from '../modules/campaigns/campaigns.routes';

// Dentro do bloco /api/v2/:
    const campaignsResult = await campaignsRoutes(req, method, pathname, url);
    if (campaignsResult) return campaignsResult;
```

- [ ] **3.4 Iniciar worker em server.ts**

```typescript
// No topo:
import { startCampaignWorker } from './modules/campaigns/campaigns.worker';

// Apos scheduleTokenRefreshJob():
startCampaignWorker();
```

- [ ] **3.5 Rodar todos os testes**
```
bun test
```

- [ ] **3.6 Commit**
```
git add src/modules/campaigns/ src/routes/router.ts src/server.ts
git commit -m "feat(campaigns): controller, rotas API e inicio do worker em server.ts"
```

---

## Task 4: Frontend — CampaignList e CampaignDetail

**Files:**
- Create: src/frontend/pages/campaigns/CampaignList.tsx
- Create: src/frontend/pages/campaigns/CampaignDetail.tsx

- [ ] **4.1 Criar src/frontend/pages/campaigns/CampaignList.tsx**

```tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StatusBadge from '../../components/StatusBadge';

interface Campaign {
  id: string; name: string; template_name: string; status: string;
  total_contacts: number; created_at: string;
  metrics: { sent: number; delivered: number; read: number; failed: number };
}

const FILTERS = [
  { label: 'Todas', value: '' },
  { label: 'Em Andamento', value: 'running' },
  { label: 'Agendadas', value: 'pending' },
  { label: 'Concluidas', value: 'done' },
  { label: 'Canceladas', value: 'cancelled' },
];

export default function CampaignList() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch(`/api/v2/campaigns${filter ? `?status=${filter}` : ''}`)
      .then(r => r.json())
      .then(data => { setCampaigns(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load(); }, [filter]);

  async function handleAction(id: string, action: 'pause' | 'resume' | 'cancel') {
    if (action === 'cancel' && !confirm('Cancelar campanha?')) return;
    // cancel → DELETE /api/v2/campaigns/:id  (sem sub-path)
    // pause/resume → PATCH /api/v2/campaigns/:id/pause|resume
    const url = action === 'cancel'
      ? `/api/v2/campaigns/${id}`
      : `/api/v2/campaigns/${id}/${action}`;
    await fetch(url, {
      method: action === 'cancel' ? 'DELETE' : 'PATCH',
    });
    load();
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Disparos em Massa</h1>
          <p className="text-sm text-gray-500">Envie templates para multiplos contatos via Meta Official API</p>
        </div>
        <button onClick={() => navigate('/painel/campanhas/nova')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
          + Nova Campanha
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4">
        {FILTERS.map(f => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium ${filter === f.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-sm text-gray-400">Carregando...</div>}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">CAMPANHA</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">STATUS</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">PROGRESSO</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">DATA</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600"></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map(c => (
              <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-gray-400">{c.template_name}</div>
                </td>
                <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                <td className="px-4 py-3 text-gray-500">{c.total_contacts} contatos</td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(c.created_at).toLocaleString('pt-BR')}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {c.status === 'running' && (
                      <>
                        <button onClick={() => handleAction(c.id, 'pause')}
                          className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-100" title="Pausar">
                          ⏸
                        </button>
                        <button onClick={() => handleAction(c.id, 'cancel')}
                          className="text-xs px-2 py-1 border border-red-200 text-red-500 rounded hover:bg-red-50" title="Cancelar">
                          ⊘
                        </button>
                      </>
                    )}
                    {c.status === 'paused' && (
                      <button onClick={() => handleAction(c.id, 'resume')}
                        className="text-xs px-2 py-1 border border-green-200 text-green-600 rounded hover:bg-green-50" title="Retomar">
                        ▶
                      </button>
                    )}
                    <button onClick={() => navigate(`/painel/campanhas/${c.id}`)}
                      className="text-xs px-3 py-1 border border-gray-200 rounded hover:bg-gray-100">
                      Detalhes
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && campaigns.length === 0 && (
          <div className="p-8 text-center text-gray-400 text-sm">Nenhuma campanha encontrada.</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **4.2 Criar src/frontend/pages/campaigns/CampaignDetail.tsx**

```tsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MetricCard from '../../components/MetricCard';
import StatusBadge from '../../components/StatusBadge';

interface Campaign {
  id: string; name: string; template_name: string; template_language: string;
  status: string; total_contacts: number; delay_seconds: number; meta_tier: number; created_at: string;
  metrics: { total: number; pending: number; sent: number; delivered: number; read: number; failed: number; cancelled: number };
}

interface Contact {
  id: number; phone: string; status: string; wamid: string | null;
  sent_at: string | null; delivered_at: string | null; read_at: string | null;
  error_code: string | null; error_message: string | null;
}

const STATUS_FILTER = ['Todos', 'Pendente', 'Enviado', 'Entregue', 'Lido', 'Falhou', 'Cancelado'];
const STATUS_MAP: Record<string, string> = {
  'Pendente': 'pending', 'Enviado': 'sent', 'Entregue': 'delivered',
  'Lido': 'read', 'Falhou': 'failed', 'Cancelado': 'cancelled',
};

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [loading, setLoading] = useState(true);

  function load() {
    if (!id) return;
    Promise.all([
      fetch(`/api/v2/campaigns/${id}`).then(r => r.json()),
      fetch(`/api/v2/campaigns/${id}/contacts${statusFilter !== 'Todos' ? `?status=${STATUS_MAP[statusFilter]}` : ''}`).then(r => r.json()),
    ]).then(([c, ct]) => {
      setCampaign(c);
      setContacts(Array.isArray(ct) ? ct : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => { load(); }, [id, statusFilter]);

  if (loading) return <div className="p-8 text-gray-400">Carregando...</div>;
  if (!campaign) return <div className="p-8 text-gray-400">Campanha nao encontrada.</div>;

  const m = campaign.metrics;

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="mb-2">
        <button onClick={() => navigate('/painel/campanhas')} className="text-sm text-gray-400 hover:text-gray-600">
          &larr; Campanhas
        </button>
      </div>
      <div className="flex items-center gap-3 mb-6">
        <span className="text-2xl">📢</span>
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            {campaign.name} <StatusBadge status={campaign.status} />
          </h1>
          <p className="text-sm text-gray-500">{campaign.template_name} &middot; {campaign.template_language}</p>
        </div>
      </div>

      {/* Metricas */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <MetricCard label="Total" value={m.total} color="gray" icon="👥" />
        <MetricCard label="Enviados" value={m.sent} total={m.total} color="blue" icon="📤" />
        <MetricCard label="Entregues" value={m.delivered} total={m.total} color="green" icon="✅" />
        <MetricCard label="Lidos" value={m.read} total={m.total} color="purple" icon="👁" />
        <MetricCard label="Falhas" value={m.failed} total={m.total} color="red" icon="✗" />
      </div>

      {/* Filtro de status */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_FILTER.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {s}
          </button>
        ))}
      </div>

      {/* Tabela de contatos */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">TELEFONE</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">STATUS</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">ENVIADO</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">ENTREGUE</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">LIDO</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map(c => (
              <tr key={c.id} className="border-b border-gray-100">
                <td className="px-4 py-3 font-medium">{c.phone}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={c.status} />
                  {c.error_message && (
                    <p className="text-xs text-red-400 mt-0.5">{c.error_message}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {c.sent_at ? new Date(c.sent_at).toLocaleString('pt-BR') : '—'}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {c.delivered_at ? new Date(c.delivered_at).toLocaleString('pt-BR') : '—'}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {c.read_at ? new Date(c.read_at).toLocaleString('pt-BR') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {contacts.length === 0 && (
          <div className="p-8 text-center text-gray-400 text-sm">Nenhum contato com esse status.</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **4.3 Rodar todos os testes**
```
bun test
```

- [ ] **4.4 Commit**
```
git add src/frontend/pages/campaigns/CampaignList.tsx src/frontend/pages/campaigns/CampaignDetail.tsx
git commit -m "feat(campaigns): paginas CampaignList e CampaignDetail com metricas"
```

---

## Task 5: Frontend — CampaignWizard (3 etapas)

**Files:**
- Create: src/frontend/pages/campaigns/CampaignWizard.tsx
- Modify: src/frontend/App.tsx

- [ ] **5.1 Criar src/frontend/pages/campaigns/CampaignWizard.tsx**

```tsx
import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

// ─── Tipos ────────────────────────────────────────────────────

interface Contact { phone: string; variables: Record<string, string> }
interface ParseResult { contacts: Contact[]; columns: string[] }
interface Template { name: string; status: string; category: string; language: string; components?: any[] }

// ─── Utilitarios ─────────────────────────────────────────────

function getTemplateVars(components: any[] = []): string[] {
  const body = components.find(c => c.type === 'BODY');
  if (!body?.text) return [];
  return Array.from(new Set((body.text.match(/\{\{\d+\}\}/g) ?? [])));
}

function getBodyText(components: any[] = []): string {
  return components.find(c => c.type === 'BODY')?.text ?? '';
}

function renderPreview(body: string, mapping: Record<string, string>, contact: Contact): string {
  let result = body;
  Object.entries(mapping).forEach(([variable, column]) => {
    result = result.replace(variable, contact.variables[column] ?? variable);
  });
  return result;
}

// ─── Etapa 1: Upload CSV/XLSX ─────────────────────────────────

function StepUpload({ onNext }: { onNext: (result: ParseResult, name: string) => void }) {
  const [name, setName] = useState('');
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(''); setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name || 'temp');
    // Usa endpoint de preview para validar o arquivo
    // Solucao simples: parsear no frontend para preview, enviar arquivo real no submit final
    // Por simplicidade, envia para um endpoint de parse e retorna colunas + preview
    try {
      const res = await fetch('/api/v2/campaigns/parse', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao ler arquivo');
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Campanha *</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="Ex: Promocao Junho, Confirmacao de Consulta..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Lista de Contatos</label>
        <div onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400">
          <div className="text-4xl mb-2">📊</div>
          <p className="text-sm text-gray-500">Arraste o arquivo ou clique para selecionar</p>
          <p className="text-xs text-gray-400">Suporta .csv, .xlsx, .xls — maximo de 10.000 contatos</p>
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </div>
      </div>

      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
        <strong>Formato esperado:</strong> A primeira linha deve ser o cabecalho. A coluna <strong>telefone</strong> e obrigatoria com DDI (ex: 5511999999999). As demais colunas viram variaveis do template.
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      {loading && <div className="text-sm text-gray-400">Processando arquivo...</div>}

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-sm font-medium text-green-800 mb-2">{result.contacts.length} contatos carregados</p>
          <p className="text-xs text-green-700">Colunas: telefone, {result.columns.join(', ')}</p>
          <table className="w-full mt-2 text-xs">
            <thead><tr className="text-gray-500">{['TELEFONE', ...result.columns].map(c => <th key={c} className="text-left pb-1">{c.toUpperCase()}</th>)}</tr></thead>
            <tbody>
              {result.contacts.slice(0, 3).map((c, i) => (
                <tr key={i}><td className="pr-4">{c.phone}</td>{result.columns.map(col => <td key={col} className="pr-4">{c.variables[col]}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button onClick={() => result && name && onNext(result, name)}
        disabled={!result || !name}
        className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
        Proxima Etapa →
      </button>
    </div>
  );
}

// ─── Etapa 2: Canal & Template ────────────────────────────────

function StepTemplate({
  columns, onNext, onBack,
}: {
  columns: string[];
  onNext: (phoneId: string, template: Template, mapping: Record<string, string>) => void;
  onBack: () => void;
}) {
  const [phoneId, setPhoneId] = useState('');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  React.useEffect(() => {
    fetch('/api/v2/accounts').then(r => r.json()).then(setAccounts).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (!phoneId) return;
    setLoadingTemplates(true);
    fetch(`/api/v2/templates/${phoneId}`)
      .then(r => r.json())
      .then(data => {
        setTemplates(Array.isArray(data) ? data.filter((t: Template) => t.status === 'APPROVED') : []);
        setLoadingTemplates(false);
      })
      .catch(() => setLoadingTemplates(false));
  }, [phoneId]);

  const templateVars = selectedTemplate ? getTemplateVars(selectedTemplate.components ?? []) : [];

  function previewText(): string {
    if (!selectedTemplate) return '';
    const body = getBodyText(selectedTemplate.components ?? []);
    const mockContact: Contact = { phone: '5500000000000', variables: Object.fromEntries(columns.map(c => [c, `[${c}]`])) };
    return renderPreview(body, mapping, mockContact);
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Canal de Envio</label>
        <div className="grid grid-cols-2 gap-3">
          {accounts.map(a => (
            <button key={a.phone_number_id} onClick={() => setPhoneId(a.phone_number_id)}
              className={`flex items-center gap-3 p-3 border-2 rounded-xl text-left ${phoneId === a.phone_number_id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <span className="text-2xl">📱</span>
              <div>
                <div className="font-medium text-sm">{a.name}</div>
                <div className="text-xs text-gray-400">WhatsApp Oficial</div>
              </div>
              {phoneId === a.phone_number_id && <span className="ml-auto text-blue-500">✓</span>}
            </button>
          ))}
        </div>
      </div>

      {phoneId && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Template de Mensagem</label>
          <p className="text-xs text-gray-400 mb-2">Apenas templates APPROVED disponiveis</p>
          {loadingTemplates && <div className="text-sm text-gray-400">Buscando templates...</div>}
          <div className="space-y-2">
            {templates.map(t => (
              <button key={t.name} onClick={() => { setSelectedTemplate(t); setMapping({}); }}
                className={`w-full flex items-center gap-3 p-3 border-2 rounded-xl text-left ${selectedTemplate?.name === t.name ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <span className="text-lg">{t.category === 'MARKETING' ? '📢' : t.category === 'UTILITY' ? '⚙️' : '🔒'}</span>
                <div className="flex-1">
                  <div className="font-medium text-sm">{t.name}</div>
                  <div className="text-xs text-gray-400">{getBodyText(t.components ?? []).substring(0, 60)}...</div>
                </div>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{t.language}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedTemplate && templateVars.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Mapeamento de Variaveis</label>
          <p className="text-xs text-gray-500 mb-2">Associe cada variavel do template a uma coluna da planilha</p>
          {templateVars.map(v => (
            <div key={v} className="flex items-center gap-3 mb-2">
              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded font-mono min-w-[60px] text-center">{v}</span>
              <span className="text-gray-400">→</span>
              <select value={mapping[v] ?? ''} onChange={e => setMapping(prev => ({ ...prev, [v]: e.target.value }))}
                className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Selecionar coluna...</option>
                {columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      {selectedTemplate && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
          <p className="text-xs text-gray-500 mb-2">Preview da Mensagem</p>
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 max-w-xs">
            <p className="text-sm">{previewText() || getBodyText(selectedTemplate.components ?? [])}</p>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">← Voltar</button>
        <button onClick={() => selectedTemplate && phoneId && onNext(phoneId, selectedTemplate, mapping)}
          disabled={!selectedTemplate || !phoneId}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
          Proxima Etapa →
        </button>
      </div>
    </div>
  );
}

// ─── Etapa 3: Confirmar Disparo ───────────────────────────────

function StepConfirm({
  campaignName, phoneId, template, mapping, contacts, onBack, onSubmit,
}: {
  campaignName: string; phoneId: string; template: Template;
  mapping: Record<string, string>; contacts: Contact[];
  onBack: () => void; onSubmit: (scheduled_at: string | null, delay: number, tier: number) => void;
}) {
  const [useSchedule, setUseSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [delay, setDelay] = useState(3);
  const [tier, setTier] = useState(1);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-2">
        <input type="checkbox" id="schedule" checked={useSchedule} onChange={e => setUseSchedule(e.target.checked)} />
        <label htmlFor="schedule" className="text-sm font-medium">Agendar para depois</label>
      </div>
      {useSchedule && (
        <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Delay entre mensagens (segundos)</label>
          <input type="number" min={1} max={60} value={delay} onChange={e => setDelay(parseInt(e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Meta Tier</label>
          <select value={tier} onChange={e => setTier(parseInt(e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value={1}>Tier 1 — ate 1.000/dia</option>
            <option value={2}>Tier 2 — ate 10.000/dia</option>
            <option value={3}>Tier 3 — ate 100.000/dia</option>
          </select>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="font-medium text-sm mb-3">Resumo do Disparo</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div><p className="text-xs text-gray-400">CANAL</p><p className="font-medium">{phoneId}</p></div>
          <div><p className="text-xs text-gray-400">TEMPLATE</p><p className="font-medium">{template.name}</p><p className="text-xs text-gray-400">{template.language}</p></div>
          <div><p className="text-xs text-gray-400 uppercase">Total de Contatos</p><p className="font-bold text-blue-600 text-lg">{contacts.length}</p></div>
        </div>
      </div>

      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800 space-y-1">
        <p>⚠️ Antes de confirmar:</p>
        <ul className="list-disc ml-4 space-y-0.5">
          <li>Verifique se o template esta aprovado pela Meta</li>
          <li>Certifique-se que os numeros estao no formato internacional (ex: 5511999999999)</li>
          <li>O disparo respeitara o rate limit do seu tier Meta</li>
        </ul>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">← Voltar</button>
        <button onClick={() => onSubmit(useSchedule && scheduledAt ? scheduledAt : null, delay, tier)}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
          Confirmar Disparo
        </button>
      </div>
    </div>
  );
}

// ─── Wizard principal ─────────────────────────────────────────

const STEPS = ['Upload da Lista', 'Canal & Template', 'Confirmar Disparo'];

export default function CampaignWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [campaignName, setCampaignName] = useState('');
  const [phoneId, setPhoneId] = useState('');
  const [template, setTemplate] = useState<Template | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // O arquivo CSV/XLSX precisa ser reenviado no submit final
  // Guardamos o File em estado
  const [file, setFile] = useState<File | null>(null);

  async function handleSubmit(scheduled_at: string | null, delay: number, tier: number) {
    if (!file || !parseResult || !template || !phoneId) return;
    setSubmitting(true);
    const formData = new FormData();
    formData.append('name', campaignName);
    formData.append('phone_number_id', phoneId);
    formData.append('template_name', template.name);
    formData.append('template_language', template.language);
    formData.append('variable_mapping', JSON.stringify(mapping));
    formData.append('delay_seconds', delay.toString());
    formData.append('meta_tier', tier.toString());
    formData.append('file', file);
    if (scheduled_at) formData.append('scheduled_at', scheduled_at);

    try {
      const res = await fetch('/api/v2/campaigns', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao criar campanha');
      navigate(`/painel/campanhas/${data.id}`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Nova Campanha</h1>
        <p className="text-sm text-gray-500">Envie templates WhatsApp para multiplos contatos via Meta Official API</p>
      </div>

      {/* Progress steps */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i < step ? 'bg-blue-600 text-white' : i === step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className={`text-sm ${i === step ? 'font-medium text-gray-900' : 'text-gray-400'}`}>{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className="flex-1 h-px bg-gray-200" />}
          </React.Fragment>
        ))}
      </div>

      {step === 0 && (
        <StepUpload
          onNext={(result, name) => {
            setParseResult(result);
            setCampaignName(name);
            setStep(1);
          }}
        />
      )}

      {step === 1 && parseResult && (
        <StepTemplate
          columns={parseResult.columns}
          onNext={(pid, tmpl, map) => {
            setPhoneId(pid); setTemplate(tmpl); setMapping(map);
            setStep(2);
          }}
          onBack={() => setStep(0)}
        />
      )}

      {step === 2 && template && parseResult && (
        <StepConfirm
          campaignName={campaignName} phoneId={phoneId}
          template={template} mapping={mapping} contacts={parseResult.contacts}
          onBack={() => setStep(1)} onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
```

NOTA: O wizard chama `/api/v2/campaigns/parse` para preview do arquivo. Precisamos adicionar esse endpoint no campaigns.controller.ts:

```typescript
// Adicionar em campaigns.controller.ts:
static async parseFile(req: Request): Promise<Response> {
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: 'FormData obrigatorio' }, { status: 400 });
  const file = form.get('file') as File | null;
  if (!file) return Response.json({ error: 'Arquivo obrigatorio' }, { status: 400 });
  const fname = file.name.toLowerCase();
  try {
    const result = fname.endsWith('.xlsx') || fname.endsWith('.xls')
      ? CampaignsService.parseXLSX(await file.arrayBuffer())
      : CampaignsService.parseCSV(await file.text());
    return Response.json(result);
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
```

E adicionar no campaigns.routes.ts:
```typescript
if (pathname === '/api/v2/campaigns/parse' && method === 'POST') {
  return CampaignsController.parseFile(req);
}
```

- [ ] **5.2 Adicionar parseFile ao controller e rota**

Seguir as instrucoes acima para adicionar o endpoint /api/v2/campaigns/parse antes da rota /api/v2/campaigns.

- [ ] **5.3 Atualizar App.tsx**

Substituir o placeholder de campanhas:

```tsx
// Remover:
const CampaignList = () => <div className="p-8 text-gray-500">Campanhas (plano 4)</div>;

// Adicionar imports:
import CampaignList from './pages/campaigns/CampaignList';
import CampaignDetail from './pages/campaigns/CampaignDetail';
import CampaignWizard from './pages/campaigns/CampaignWizard';
```

Atualizar rotas no JSX:
```tsx
<Route path="campanhas" element={<CampaignList />} />
<Route path="campanhas/nova" element={<CampaignWizard />} />
<Route path="campanhas/:id" element={<CampaignDetail />} />
```

- [ ] **5.4 Smoke test completo**
```
bun run src/server.ts
# 1. Acessa /painel/campanhas — deve listar campanhas
# 2. Clica Nova Campanha — wizard abre com 3 etapas
# 3. Etapa 1: sobe um CSV com colunas telefone,nome
# 4. Etapa 2: seleciona conta e template APPROVED, mapeia variavel
# 5. Etapa 3: confirma disparo
# 6. Redireciona para CampaignDetail com metricas
# 7. Worker processa jobs e status atualiza apos refresh
```

- [ ] **5.5 Rodar todos os testes**
```
bun test
```

- [ ] **5.6 Commit**
```
git add src/frontend/pages/campaigns/ src/frontend/App.tsx src/modules/campaigns/
git commit -m "feat(campaigns): wizard 3 etapas, CampaignList, CampaignDetail e endpoint parse"
```

---

## Verificacao Final do Plano 4

- [ ] POST /api/v2/campaigns cria campanha com contacts e jobs
- [ ] GET /api/v2/campaigns lista com metricas
- [ ] PATCH /api/v2/campaigns/:id/pause e resume funcionam
- [ ] DELETE /api/v2/campaigns/:id cancela e propaga para contacts e jobs
- [ ] Worker processa jobs com delay e respeita rate limit do tier
- [ ] Webhook atualiza campaign_contacts por wamid (do Plano 1)
- [ ] Wizard 3 etapas funciona end-to-end
- [ ] bun test passa sem regressao

**Sistema completo entregue!**

Funcionalidades:
- Painel React em /painel com sidebar
- Conversas: inbox por conta com historico persistente
- Templates: CRUD via Meta Graph API
- Campanhas: wizard CSV/XLSX, agendamento, worker com delay + rate limit, metricas por contato

# UI Redesign — Implementação do layout.pen

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar as 9 telas do layout.pen com design system Tailwind, novos módulos de API (Dashboard, Accounts) e refatoração do frontend existente.

**Architecture:** Design System First — tokens Tailwind via CDN config + componentes base antes das telas. Backend: novos endpoints em router.ts + modules para accounts e dashboard usando db.service.ts existente. Frontend: React SPA com Sidebar de 6 itens, lucide-react, rotas atualizadas.

**Tech Stack:** Bun, TypeScript, React 19, react-router-dom v7, lucide-react, Tailwind CDN v3, bun:sqlite

---

## Task 1: Setup — Tailwind custom tokens + lucide-react

**Files:**
- Modify: `src/frontend/index.html`

**Step 1: Instalar lucide-react**

```bash
bun add lucide-react
```

Saída esperada: `+ lucide-react@x.x.x`

**Step 2: Adicionar config Tailwind no index.html**

Substituir o `<script src="https://cdn.tailwindcss.com"></script>` existente por:

```html
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          primary: {
            DEFAULT: '#4F46E5',
            light: '#EEF2FF',
            dark: '#3730A3',
          },
          text: {
            primary: '#111827',
            secondary: '#6B7280',
            tertiary: '#9CA3AF',
          },
          bg: {
            white: '#FFFFFF',
            default: '#F9FAFB',
          },
          border: {
            DEFAULT: '#E5E7EB',
            strong: '#D1D5DB',
          },
        },
        borderRadius: {
          md: '8px',
          lg: '12px',
          xl: '16px',
        },
      },
    },
  }
</script>
```

**Step 3: Verificar no browser**

Rodar: `bun run dev` (ou `bun src/server.ts`)
Abrir `/painel` e verificar que a sidebar ainda aparece (sem quebrar).

**Step 4: Commit**

```bash
git add src/frontend/index.html
git commit -m "feat(design): adiciona tokens Tailwind CDN + instala lucide-react"
```

---

## Task 2: UI Components — Button, Badge, Card

**Files:**
- Create: `src/frontend/components/ui/Button.tsx`
- Create: `src/frontend/components/ui/Badge.tsx`
- Create: `src/frontend/components/ui/Card.tsx`

**Step 1: Criar Button.tsx**

```tsx
// src/frontend/components/ui/Button.tsx
import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark',
  secondary: 'bg-white text-primary border border-primary hover:bg-primary-light',
  ghost: 'bg-transparent text-text-secondary hover:bg-bg-default',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

export function Button({ variant = 'primary', size = 'md', loading, children, className = '', disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex items-center gap-2 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
```

**Step 2: Criar Badge.tsx**

```tsx
// src/frontend/components/ui/Badge.tsx
import React from 'react';

type BadgeVariant = 'success' | 'warning' | 'error' | 'default' | 'info';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variants: Record<BadgeVariant, string> = {
  success: 'bg-green-100 text-green-700',
  warning: 'bg-yellow-100 text-yellow-700',
  error: 'bg-red-100 text-red-700',
  default: 'bg-gray-100 text-gray-600',
  info: 'bg-primary-light text-primary',
};

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}
```

**Step 3: Criar Card.tsx**

```tsx
// src/frontend/components/ui/Card.tsx
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

const paddings = { sm: 'p-3', md: 'p-4', lg: 'p-6' };

export function Card({ children, className = '', hover, padding = 'md', onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-white border border-border rounded-lg ${paddings[padding]} ${hover ? 'hover:shadow-md cursor-pointer transition-shadow' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add src/frontend/components/ui/
git commit -m "feat(ui): adiciona Button, Badge e Card components"
```

---

## Task 3: UI Components — Input, Select, Textarea

**Files:**
- Create: `src/frontend/components/ui/Input.tsx`
- Create: `src/frontend/components/ui/Select.tsx`
- Create: `src/frontend/components/ui/Textarea.tsx`

**Step 1: Criar Input.tsx**

```tsx
// src/frontend/components/ui/Input.tsx
import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s/g, '-');
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-text-primary">
          {label}
        </label>
      )}
      <input
        id={inputId}
        {...props}
        className={`border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-bg-default ${error ? 'border-red-500' : ''} ${className}`}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
```

**Step 2: Criar Select.tsx**

```tsx
// src/frontend/components/ui/Select.tsx
import React from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export function Select({ label, error, className = '', id, children, ...props }: SelectProps) {
  const selectId = id ?? label?.toLowerCase().replace(/\s/g, '-');
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-text-primary">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          {...props}
          className={`w-full border border-border rounded-lg px-3 py-2 text-sm text-text-primary appearance-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white pr-8 ${error ? 'border-red-500' : ''} ${className}`}
        >
          {children}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none" />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
```

**Step 3: Criar Textarea.tsx**

```tsx
// src/frontend/components/ui/Textarea.tsx
import React from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  maxLength?: number;
}

export function Textarea({ label, error, maxLength, className = '', id, value, onChange, ...props }: TextareaProps) {
  const textareaId = id ?? label?.toLowerCase().replace(/\s/g, '-');
  const currentLength = typeof value === 'string' ? value.length : 0;
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={textareaId} className="text-sm font-medium text-text-primary">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        value={value}
        onChange={onChange}
        maxLength={maxLength}
        {...props}
        className={`border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-y min-h-[80px] ${error ? 'border-red-500' : ''} ${className}`}
      />
      <div className="flex justify-between">
        {error ? <p className="text-xs text-red-600">{error}</p> : <span />}
        {maxLength && (
          <p className="text-xs text-text-tertiary">{currentLength}/{maxLength}</p>
        )}
      </div>
    </div>
  );
}
```

**Step 4: Criar index.ts para re-exports**

```ts
// src/frontend/components/ui/index.ts
export { Button } from './Button';
export { Badge } from './Badge';
export { Card } from './Card';
export { Input } from './Input';
export { Select } from './Select';
export { Textarea } from './Textarea';
```

**Step 5: Commit**

```bash
git add src/frontend/components/ui/
git commit -m "feat(ui): adiciona Input, Select, Textarea e barrel export"
```

---

## Task 4: Sidebar + Layout + App.tsx com todas as rotas

**Files:**
- Create: `src/frontend/components/Sidebar.tsx`
- Modify: `src/frontend/components/Layout.tsx`
- Modify: `src/frontend/App.tsx`

**Step 1: Criar Sidebar.tsx**

```tsx
// src/frontend/components/Sidebar.tsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageCircle,
  FileText,
  Megaphone,
  Smartphone,
  Settings,
} from 'lucide-react';

const NAV = [
  { to: '/painel/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/painel/conversas', label: 'Conversas', icon: MessageCircle },
  { to: '/painel/templates', label: 'Templates', icon: FileText },
  { to: '/painel/campanhas', label: 'Campanhas', icon: Megaphone },
  { to: '/painel/contas', label: 'Contas', icon: Smartphone },
  { to: '/painel/configuracoes', label: 'Configurações', icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className="w-56 bg-white border-r border-border flex flex-col shrink-0">
      {/* Logo */}
      <div className="p-4 border-b border-border">
        <span className="font-bold text-primary text-sm">HaruCode</span>
        <span className="text-text-tertiary text-xs ml-1">Painel</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-primary-light text-primary font-semibold'
                  : 'text-text-secondary hover:bg-bg-default'
              }`
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-border">
        <a
          href="/admin"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-text-tertiary hover:bg-bg-default transition-colors"
        >
          <Settings className="h-4 w-4 shrink-0" />
          Admin
        </a>
      </div>
    </aside>
  );
}
```

**Step 2: Substituir Layout.tsx**

```tsx
// src/frontend/components/Layout.tsx
import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="flex h-screen bg-bg-default">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
```

**Step 3: Atualizar App.tsx com todas as rotas**

```tsx
// src/frontend/App.tsx
import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import NotFound from './pages/NotFound';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const ConversationList = lazy(() => import('./pages/conversations/ConversationList'));
const TemplateList = lazy(() => import('./pages/templates/TemplateList'));
const TemplateForm = lazy(() => import('./pages/templates/TemplateForm'));
const CampaignList = lazy(() => import('./pages/campaigns/CampaignList'));
const CampaignDetail = lazy(() => import('./pages/campaigns/CampaignDetail'));
const CampaignWizard = lazy(() => import('./pages/campaigns/CampaignWizard'));
const AccountList = lazy(() => import('./pages/accounts/AccountList'));
const Settings = lazy(() => import('./pages/settings/Settings'));

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="flex h-screen items-center justify-center text-text-secondary text-sm">Carregando...</div>}>
        <Routes>
          <Route path="/painel" element={<Layout />}>
            <Route index element={<Navigate to="/painel/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="campanhas" element={<CampaignList />} />
            <Route path="campanhas/nova" element={<CampaignWizard />} />
            <Route path="campanhas/:id" element={<CampaignDetail />} />
            <Route path="templates" element={<TemplateList />} />
            <Route path="templates/novo" element={<TemplateForm />} />
            <Route path="conversas/*" element={<ConversationList />} />
            <Route path="contas" element={<AccountList />} />
            <Route path="configuracoes" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
```

**Step 4: Verificar no browser**

Abrir `/painel` — deve redirecionar para `/painel/dashboard`. Sidebar com 6 itens aparece. Item ativo fica indigo.

**Step 5: Commit**

```bash
git add src/frontend/components/Sidebar.tsx src/frontend/components/Layout.tsx src/frontend/App.tsx
git commit -m "feat(layout): sidebar com 6 itens Lucide + rotas atualizadas no App.tsx"
```

---

## Task 5: Backend — Accounts module (CRUD completo)

**Files:**
- Create: `src/modules/accounts/accounts.service.ts`
- Create: `src/modules/accounts/accounts.controller.ts`
- Create: `src/modules/accounts/accounts.routes.ts`
- Modify: `src/routes/router.ts`

**Step 1: Criar accounts.service.ts**

```ts
// src/modules/accounts/accounts.service.ts
import { db } from '../../services/db.service';
import type { Client, CreateClientInput, UpdateClientInput } from '../../services/db.service';

export class AccountsService {
  static list(): Client[] {
    return db.getAllClients();
  }

  static get(id: string): Client | null {
    return db.getClientById(id) ?? null;
  }

  static create(input: CreateClientInput): Client {
    const id = db.createClient(input);
    return db.getClientById(id)!;
  }

  static update(id: string, input: UpdateClientInput): Client | null {
    const existing = db.getClientById(id);
    if (!existing) return null;
    db.updateClient(id, input);
    return db.getClientById(id)!;
  }

  static delete(id: string): boolean {
    const existing = db.getClientById(id);
    if (!existing) return false;
    db.deleteClient(id);
    return true;
  }
}
```

**Step 2: Criar accounts.controller.ts**

```ts
// src/modules/accounts/accounts.controller.ts
import { AccountsService } from './accounts.service';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export class AccountsController {
  static list(): Response {
    const accounts = AccountsService.list();
    return json(accounts);
  }

  static async create(req: Request): Promise<Response> {
    const body = await req.json() as any;
    if (!body.name || !body.phone_number_id || !body.meta_token) {
      return json({ error: 'name, phone_number_id e meta_token são obrigatórios' }, 400);
    }
    try {
      const account = AccountsService.create(body);
      return json(account, 201);
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  static async update(req: Request, id: string): Promise<Response> {
    const body = await req.json() as any;
    const account = AccountsService.update(id, body);
    if (!account) return json({ error: 'Conta não encontrada' }, 404);
    return json(account);
  }

  static delete(id: string): Response {
    const ok = AccountsService.delete(id);
    if (!ok) return json({ error: 'Conta não encontrada' }, 404);
    return json({ ok: true });
  }
}
```

**Step 3: Criar accounts.routes.ts**

```ts
// src/modules/accounts/accounts.routes.ts
import { AccountsController } from './accounts.controller';

export async function accountsRoutes(req: Request, method: string, pathname: string): Promise<Response | null> {
  if (pathname === '/api/v2/accounts') {
    if (method === 'GET') return AccountsController.list();
    if (method === 'POST') return AccountsController.create(req);
  }

  const idMatch = pathname.match(/^\/api\/v2\/accounts\/([^/]+)$/);
  if (idMatch) {
    const id = idMatch[1];
    if (method === 'PATCH') return AccountsController.update(req, id);
    if (method === 'DELETE') return AccountsController.delete(id);
  }

  return null;
}
```

**Step 4: Registrar em router.ts**

Adicionar import no topo de `src/routes/router.ts`:
```ts
import { accountsRoutes } from '../modules/accounts/accounts.routes';
```

No bloco `/api/v2/`, antes da linha `if (method === 'GET' && pathname === '/api/v2/accounts')`, adicionar:
```ts
const accountsResult = await accountsRoutes(req, method, pathname);
if (accountsResult) return accountsResult;
```

Remover o bloco legado:
```ts
// REMOVER estas linhas:
if (method === 'GET' && pathname === '/api/v2/accounts') {
  return PanelController.listAccounts();
}
```

**Step 5: Testar com curl**

```bash
# Listar contas
curl -s -b "session=..." http://localhost:3000/api/v2/accounts | jq .

# Criar conta de teste
curl -s -X POST -b "session=..." -H "Content-Type: application/json" \
  -d '{"name":"Teste","phone_number_id":"123","meta_token":"abc","webhook_url":"http://test"}' \
  http://localhost:3000/api/v2/accounts | jq .
```

**Step 6: Commit**

```bash
git add src/modules/accounts/ src/routes/router.ts
git commit -m "feat(accounts): módulo CRUD completo — GET/POST/PATCH/DELETE /api/v2/accounts"
```

---

## Task 6: Backend — Dashboard endpoint + Config endpoint

**Files:**
- Create: `src/modules/dashboard/dashboard.service.ts`
- Create: `src/modules/dashboard/dashboard.routes.ts`
- Modify: `src/routes/router.ts`

**Step 1: Criar dashboard.service.ts**

```ts
// src/modules/dashboard/dashboard.service.ts
import { db } from '../../services/db.service';

export interface DashboardMetrics {
  messages_sent_7d: number;
  delivery_rate: number;
  read_rate: number;
  active_campaigns: number;
  recent_campaigns: Array<{
    id: string;
    name: string;
    status: string;
    total_contacts: number;
    sent: number;
    delivered: number;
  }>;
}

export class DashboardService {
  static getMetrics(phone_number_id: string): DashboardMetrics {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const sent7d = db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM messages WHERE phone_number_id = ? AND direction = 'outbound' AND created_at >= ?`,
      [phone_number_id, since]
    )[0]?.count ?? 0;

    const deliveredRow = db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM messages WHERE phone_number_id = ? AND direction = 'outbound' AND status IN ('delivered','read') AND created_at >= ?`,
      [phone_number_id, since]
    )[0];
    const delivered7d = deliveredRow?.count ?? 0;

    const readRow = db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM messages WHERE phone_number_id = ? AND direction = 'outbound' AND status = 'read' AND created_at >= ?`,
      [phone_number_id, since]
    )[0];
    const read7d = readRow?.count ?? 0;

    const delivery_rate = sent7d > 0 ? Math.round((delivered7d / sent7d) * 100) : 0;
    const read_rate = sent7d > 0 ? Math.round((read7d / sent7d) * 100) : 0;

    const activeCampaigns = db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM campaigns WHERE phone_number_id = ? AND status IN ('pending','running','paused')`,
      [phone_number_id]
    )[0]?.count ?? 0;

    const recent = db.query<any>(
      `SELECT c.id, c.name, c.status, c.total_contacts,
         COALESCE(SUM(CASE WHEN cc.status IN ('sent','delivered','read') THEN 1 ELSE 0 END), 0) as sent,
         COALESCE(SUM(CASE WHEN cc.status IN ('delivered','read') THEN 1 ELSE 0 END), 0) as delivered
       FROM campaigns c
       LEFT JOIN campaign_contacts cc ON cc.campaign_id = c.id
       WHERE c.phone_number_id = ?
       GROUP BY c.id
       ORDER BY c.created_at DESC
       LIMIT 5`,
      [phone_number_id]
    );

    return {
      messages_sent_7d: sent7d,
      delivery_rate,
      read_rate,
      active_campaigns: activeCampaigns,
      recent_campaigns: recent,
    };
  }
}
```

**Step 2: Criar dashboard.routes.ts**

```ts
// src/modules/dashboard/dashboard.routes.ts
import { DashboardService } from './dashboard.service';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export function dashboardRoutes(req: Request, method: string, pathname: string): Response | null {
  const match = pathname.match(/^\/api\/v2\/dashboard\/([^/]+)$/);
  if (match && method === 'GET') {
    try {
      const metrics = DashboardService.getMetrics(match[1]);
      return json(metrics);
    } catch (e: any) {
      return json({ error: e.message }, 500);
    }
  }

  if (pathname === '/api/v2/config' && method === 'GET') {
    const { env } = require('../../config/env');
    return json({
      version: process.env.npm_package_version ?? '1.0.0',
      base_url: env.BASE_URL ?? `http://localhost:${env.PORT}`,
      webhook_url: `${env.BASE_URL ?? `http://localhost:${env.PORT}`}/webhook`,
    });
  }

  return null;
}
```

**Nota:** O `require` no dashboard.routes.ts não é ideal — refatorar com import estático se houver problema de tipagem. Alternativa:

```ts
import { env } from '../../config/env';
// usar env diretamente
```

**Step 3: Registrar em router.ts**

Adicionar import:
```ts
import { dashboardRoutes } from '../modules/dashboard/dashboard.routes';
```

No bloco `/api/v2/`, antes dos outros `xxxResult`:
```ts
const dashboardResult = dashboardRoutes(req, method, pathname);
if (dashboardResult) return dashboardResult;
```

**Step 4: Commit**

```bash
git add src/modules/dashboard/ src/routes/router.ts
git commit -m "feat(dashboard): endpoint GET /api/v2/dashboard/:phone_id + GET /api/v2/config"
```

---

## Task 7: Screen 1 — Dashboard.tsx

**Files:**
- Create: `src/frontend/pages/Dashboard.tsx`

**Step 1: Criar Dashboard.tsx**

```tsx
// src/frontend/pages/Dashboard.tsx
import React, { useState, useEffect } from 'react';
import { Send, CheckCircle, BookOpen, Megaphone } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';

interface DashboardMetrics {
  messages_sent_7d: number;
  delivery_rate: number;
  read_rate: number;
  active_campaigns: number;
  recent_campaigns: Array<{
    id: string;
    name: string;
    status: string;
    total_contacts: number;
    sent: number;
    delivered: number;
  }>;
}

interface Account { id: string; name: string; phone_number_id: string; }

const statusVariant: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  done: 'success', running: 'info' as any, paused: 'warning', cancelled: 'error', pending: 'default',
};
const statusLabel: Record<string, string> = {
  done: 'Concluída', running: 'Em andamento', paused: 'Pausada', cancelled: 'Cancelada', pending: 'Pendente',
};

export default function Dashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/v2/accounts')
      .then(r => r.json())
      .then((data: Account[]) => {
        setAccounts(data);
        if (data.length > 0) setSelectedId(data[0].phone_number_id);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    fetch(`/api/v2/dashboard/${selectedId}`)
      .then(r => r.json())
      .then(setMetrics)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedId]);

  const metricCards = metrics ? [
    { label: 'Enviadas (7d)', value: metrics.messages_sent_7d, icon: Send, color: 'text-primary' },
    { label: 'Taxa de Entrega', value: `${metrics.delivery_rate}%`, icon: CheckCircle, color: 'text-green-600' },
    { label: 'Taxa de Leitura', value: `${metrics.read_rate}%`, icon: BookOpen, color: 'text-blue-600' },
    { label: 'Campanhas Ativas', value: metrics.active_campaigns, icon: Megaphone, color: 'text-orange-500' },
  ] : [];

  return (
    <div className="p-6 space-y-6">
      {/* Header com seletor de conta */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Dashboard</h1>
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary bg-white"
        >
          {accounts.map(a => (
            <option key={a.phone_number_id} value={a.phone_number_id}>{a.name}</option>
          ))}
        </select>
      </div>

      {loading && <p className="text-sm text-text-secondary">Carregando métricas...</p>}

      {/* Metric cards */}
      {metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {metricCards.map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-bg-default ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-text-primary">{value}</p>
                  <p className="text-xs text-text-secondary">{label}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Campanhas recentes */}
      {metrics && metrics.recent_campaigns.length > 0 && (
        <Card padding="lg">
          <h2 className="text-sm font-semibold text-text-primary mb-4">Campanhas Recentes</h2>
          <div className="space-y-3">
            {metrics.recent_campaigns.map(c => {
              const pct = c.total_contacts > 0 ? Math.round((c.sent / c.total_contacts) * 100) : 0;
              return (
                <div key={c.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-text-primary">{c.name}</span>
                    <Badge variant={statusVariant[c.status] ?? 'default'}>
                      {statusLabel[c.status] ?? c.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-bg-default rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-text-tertiary">{c.sent}/{c.total_contacts}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {metrics && metrics.recent_campaigns.length === 0 && !loading && (
        <Card>
          <p className="text-sm text-text-secondary text-center py-4">Nenhuma campanha ainda.</p>
        </Card>
      )}
    </div>
  );
}
```

**Step 2: Verificar**

Abrir `/painel/dashboard` — deve mostrar seletor de conta, 4 metric cards, lista de campanhas recentes.

**Step 3: Commit**

```bash
git add src/frontend/pages/Dashboard.tsx
git commit -m "feat(screen): Dashboard com métricas e campanhas recentes"
```

---

## Task 8: Screen 5 — AccountList.tsx

**Files:**
- Create: `src/frontend/pages/accounts/AccountList.tsx`

**Step 1: Criar AccountList.tsx**

```tsx
// src/frontend/pages/accounts/AccountList.tsx
import React, { useState, useEffect } from 'react';
import { Smartphone, Plus, MoreVertical, Check, X } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

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
    await fetch(`/api/v2/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: current ? 0 : 1 }),
    });
    load();
    setMenuOpen(null);
  };

  const deleteAccount = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta conta?')) return;
    await fetch(`/api/v2/accounts/${id}`, { method: 'DELETE' });
    load();
    setMenuOpen(null);
  };

  const saveName = async (id: string) => {
    await fetch(`/api/v2/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName }),
    });
    load();
    setEditingId(null);
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
```

**Step 2: Commit**

```bash
git add src/frontend/pages/accounts/AccountList.tsx
git commit -m "feat(screen): AccountList com CRUD completo (editar nome, toggle ativo, excluir)"
```

---

## Task 9: Screen 3 — TemplateList refactor + TemplateBuilderModal

**Files:**
- Modify: `src/frontend/pages/templates/TemplateList.tsx`
- Create: `src/frontend/components/TemplateBuilderModal.tsx`

**Step 1: Criar TemplateBuilderModal.tsx**

```tsx
// src/frontend/components/TemplateBuilderModal.tsx
import React, { useState, useRef } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Textarea } from './ui/Textarea';

interface ButtonItem {
  type: 'QUICK_REPLY' | 'URL' | 'COPY_CODE';
  text: string;
  url?: string;
  example?: string[];
}

interface TemplateBuilderModalProps {
  phoneNumberId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function TemplateBuilderModal({ phoneNumberId, onClose, onSuccess }: TemplateBuilderModalProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('MARKETING');
  const [language, setLanguage] = useState('pt_BR');
  const [header, setHeader] = useState('');
  const [body, setBody] = useState('');
  const [footer, setFooter] = useState('');
  const [buttons, setButtons] = useState<ButtonItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const insertVariable = () => {
    const el = bodyRef.current;
    if (!el) return;
    const count = (body.match(/\{\{(\d+)\}\}/g) ?? []).length;
    const variable = `{{${count + 1}}}`;
    const pos = el.selectionStart;
    const newBody = body.slice(0, pos) + variable + body.slice(pos);
    setBody(newBody);
    setTimeout(() => { el.selectionStart = el.selectionEnd = pos + variable.length; el.focus(); }, 0);
  };

  const addButton = () => {
    if (buttons.length >= 3) return;
    setButtons(b => [...b, { type: 'QUICK_REPLY', text: '' }]);
  };

  const updateButton = (i: number, patch: Partial<ButtonItem>) => {
    setButtons(b => b.map((btn, j) => j === i ? { ...btn, ...patch } : btn));
  };

  const removeButton = (i: number) => {
    setButtons(b => b.filter((_, j) => j !== i));
  };

  const buildPreview = () => {
    let preview = body;
    const matches = body.match(/\{\{(\d+)\}\}/g) ?? [];
    matches.forEach((m, i) => { preview = preview.replace(m, `[variável ${i + 1}]`); });
    return preview;
  };

  const handleSubmit = async () => {
    setError('');
    if (!name || !body) { setError('Nome e corpo são obrigatórios'); return; }

    const components: object[] = [];
    if (header) components.push({ type: 'HEADER', format: 'TEXT', text: header });
    components.push({ type: 'BODY', text: body });
    if (footer) components.push({ type: 'FOOTER', text: footer });
    if (buttons.length > 0) {
      components.push({
        type: 'BUTTONS',
        buttons: buttons.map(b => {
          if (b.type === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: b.text };
          if (b.type === 'URL') return { type: 'URL', text: b.text, url: b.url };
          return { type: 'COPY_CODE', example: [b.example ?? ''] };
        }),
      });
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/v2/templates?phone_number_id=${phoneNumberId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category, language, components }),
      });
      if (!res.ok) {
        const d = await res.json() as any;
        setError(d.error ?? 'Erro ao criar template');
        return;
      }
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-text-primary">Novo Template</h2>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body modal — 2 colunas */}
        <div className="flex flex-1 min-h-0">
          {/* Coluna esquerda: formulário */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 border-r border-border">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Nome do template"
                value={name}
                onChange={e => setName(e.target.value.toLowerCase().replace(/\s/g, '_'))}
                placeholder="meu_template"
              />
              <Select label="Categoria" value={category} onChange={e => setCategory(e.target.value)}>
                <option value="MARKETING">Marketing</option>
                <option value="UTILITY">Utilitário</option>
                <option value="AUTHENTICATION">Autenticação</option>
              </Select>
            </div>

            <Select label="Idioma" value={language} onChange={e => setLanguage(e.target.value)}>
              <option value="pt_BR">Português (BR)</option>
              <option value="en_US">English (US)</option>
              <option value="es">Español</option>
            </Select>

            <Input
              label="Cabeçalho (opcional)"
              value={header}
              onChange={e => setHeader(e.target.value)}
              placeholder="Título do template"
              maxLength={60}
            />

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-text-primary">Corpo *</label>
                <button
                  onClick={insertVariable}
                  className="text-xs text-primary hover:text-primary-dark font-medium"
                >
                  + Variável
                </button>
              </div>
              <textarea
                ref={bodyRef}
                value={body}
                onChange={e => setBody(e.target.value)}
                maxLength={1024}
                placeholder="Olá {{1}}, sua mensagem aqui..."
                className="w-full border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary resize-y min-h-[100px]"
              />
              <p className="text-xs text-text-tertiary text-right">{body.length}/1024</p>
            </div>

            <Input
              label="Rodapé (opcional)"
              value={footer}
              onChange={e => setFooter(e.target.value)}
              placeholder="Rodapé da mensagem"
              maxLength={60}
            />

            {/* Botões */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-text-primary">Botões (até 3)</label>
                {buttons.length < 3 && (
                  <button onClick={addButton} className="text-xs text-primary hover:text-primary-dark font-medium flex items-center gap-1">
                    <Plus className="h-3 w-3" /> Adicionar
                  </button>
                )}
              </div>
              {buttons.map((btn, i) => (
                <div key={i} className="border border-border rounded-lg p-3 mb-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Select
                      value={btn.type}
                      onChange={e => updateButton(i, { type: e.target.value as any })}
                      className="flex-1"
                    >
                      <option value="QUICK_REPLY">Resposta rápida</option>
                      <option value="URL">Acessar site</option>
                      <option value="COPY_CODE">Copiar código</option>
                    </Select>
                    <button onClick={() => removeButton(i)} className="text-red-500 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <Input
                    placeholder="Texto do botão"
                    value={btn.text}
                    onChange={e => updateButton(i, { text: e.target.value })}
                  />
                  {btn.type === 'URL' && (
                    <Input
                      placeholder="https://..."
                      value={btn.url ?? ''}
                      onChange={e => updateButton(i, { url: e.target.value })}
                    />
                  )}
                  {btn.type === 'COPY_CODE' && (
                    <Input
                      placeholder="Código de exemplo"
                      value={btn.example?.[0] ?? ''}
                      onChange={e => updateButton(i, { example: [e.target.value] })}
                    />
                  )}
                </div>
              ))}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          {/* Coluna direita: preview WhatsApp */}
          <div className="w-72 shrink-0 bg-bg-default p-6 overflow-y-auto">
            <p className="text-xs font-medium text-text-secondary mb-3 uppercase tracking-wide">Preview</p>
            <div className="bg-[#ECE5DD] rounded-xl p-3 min-h-[200px]">
              <div className="bg-white rounded-lg p-3 shadow-sm max-w-[220px] ml-auto">
                {header && <p className="font-semibold text-sm text-gray-900 mb-1">{header}</p>}
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{buildPreview() || 'Corpo da mensagem...'}</p>
                {footer && <p className="text-xs text-gray-500 mt-1">{footer}</p>}
                {buttons.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                    {buttons.map((btn, i) => (
                      <button key={i} className="w-full text-center text-xs text-blue-500 font-medium py-1">
                        {btn.text || 'Botão'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer modal */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={loading}>Criar Template</Button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Refatorar TemplateList.tsx**

Ler o arquivo atual com `Read`, então substituir pelo seguinte:

```tsx
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
    fetch(`/api/v2/templates?phone_number_id=${selectedPhone}`)
      .then(r => r.json())
      .then(setTemplates)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadTemplates(); }, [selectedPhone]);

  const deleteTemplate = async (name: string) => {
    if (!confirm(`Excluir template "${name}"?`)) return;
    await fetch(`/api/v2/templates/${name}?phone_number_id=${selectedPhone}`, { method: 'DELETE' });
    loadTemplates();
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
```

**Step 3: Commit**

```bash
git add src/frontend/pages/templates/TemplateList.tsx src/frontend/components/TemplateBuilderModal.tsx
git commit -m "feat(screen): TemplateList em cards + TemplateBuilderModal com preview WhatsApp"
```

---

## Task 10: Screen 8 — CampaignWizard refactor (nova ordem de steps)

**Files:**
- Modify: `src/frontend/pages/campaigns/CampaignWizard.tsx`

A nova ordem é: Step 1 = Upload lista CSV/XLSX → Step 2 = Canal + Template + mapeamento de variáveis → Step 3 = Confirmar disparo.

**Step 1: Ler arquivo atual**

```bash
# Leia src/frontend/pages/campaigns/CampaignWizard.tsx antes de modificar
```

**Step 2: Substituir CampaignWizard.tsx**

```tsx
// src/frontend/pages/campaigns/CampaignWizard.tsx
import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, ChevronRight, ChevronLeft, AlertTriangle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';

interface Account { name: string; phone_number_id: string; }
interface Template { name: string; status: string; language: string; components?: any[]; }
interface ParsedData { headers: string[]; rows: Record<string, string>[]; total: number; }

const STEPS = ['Upload da Lista', 'Canal & Template', 'Confirmar Disparo'];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((label, i) => (
        <React.Fragment key={label}>
          <div className={`flex items-center gap-2 ${i <= current ? 'text-primary' : 'text-text-tertiary'}`}>
            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
              i < current ? 'bg-primary border-primary text-white' :
              i === current ? 'border-primary text-primary' :
              'border-border text-text-tertiary'
            }`}>
              {i < current ? '✓' : i + 1}
            </div>
            <span className="text-sm font-medium hidden sm:block">{label}</span>
          </div>
          {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border mx-1" />}
        </React.Fragment>
      ))}
    </div>
  );
}

// Step 1: Upload
function Step1({ campaignName, setCampaignName, parsedData, setParsedData, onNext }: any) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const parseFile = async (file: File) => {
    setLoading(true);
    setError('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/v2/campaigns/parse', { method: 'POST', body: fd });
      const data = await res.json() as any;
      if (!res.ok) { setError(data.error ?? 'Erro ao processar arquivo'); return; }
      if (!data.headers?.includes('telefone')) { setError('O arquivo deve ter uma coluna "telefone"'); return; }
      setParsedData(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, []);

  return (
    <div className="space-y-4">
      <Input
        label="Nome da campanha"
        value={campaignName}
        onChange={e => setCampaignName(e.target.value)}
        placeholder="Ex: Black Friday 2026"
      />

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragging ? 'border-primary bg-primary-light' : 'border-border hover:border-primary'}`}
      >
        <Upload className="h-8 w-8 mx-auto mb-2 text-text-tertiary" />
        <p className="text-sm text-text-secondary mb-2">Arraste um arquivo CSV ou XLSX, ou</p>
        <label className="cursor-pointer text-sm text-primary font-medium hover:underline">
          escolha um arquivo
          <input type="file" accept=".csv,.xlsx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) parseFile(f); }} />
        </label>
        <p className="text-xs text-text-tertiary mt-1">Coluna obrigatória: <code>telefone</code></p>
      </div>

      {loading && <p className="text-sm text-text-secondary">Processando arquivo...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {parsedData && (
        <Card padding="sm">
          <p className="text-sm font-medium text-text-primary mb-2">
            {parsedData.total} contatos — Colunas: {parsedData.headers.join(', ')}
          </p>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="border-b border-border">
                  {parsedData.headers.map((h: string) => <th key={h} className="text-left py-1 pr-3 text-text-secondary font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {parsedData.rows.slice(0, 5).map((row: any, i: number) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {parsedData.headers.map((h: string) => <td key={h} className="py-1 pr-3 text-text-primary">{row[h]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!campaignName || !parsedData}>
          Próximo <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Step 2: Canal + Template
function Step2({ accounts, selectedPhone, setSelectedPhone, templates, loadingTemplates, selectedTemplate, setSelectedTemplate, varMapping, setVarMapping, parsedData, onBack, onNext }: any) {
  const bodyComponent = selectedTemplate?.components?.find((c: any) => c.type === 'BODY');
  const variables = bodyComponent?.text?.match(/\{\{(\d+)\}\}/g) ?? [];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-text-primary mb-2">Selecionar Canal</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {accounts.map((a: Account) => (
            <Card
              key={a.phone_number_id}
              hover
              onClick={() => setSelectedPhone(a.phone_number_id)}
              className={selectedPhone === a.phone_number_id ? 'ring-2 ring-primary' : ''}
            >
              <p className="font-medium text-text-primary text-sm">{a.name}</p>
              <p className="text-xs text-text-tertiary">{a.phone_number_id}</p>
            </Card>
          ))}
        </div>
      </div>

      {selectedPhone && (
        <div>
          <p className="text-sm font-medium text-text-primary mb-2">Selecionar Template</p>
          {loadingTemplates ? (
            <p className="text-sm text-text-secondary">Carregando templates...</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto">
              {templates.filter((t: Template) => t.status === 'APPROVED').map((t: Template) => (
                <Card
                  key={t.name}
                  hover
                  onClick={() => { setSelectedTemplate(t); setVarMapping({}); }}
                  className={selectedTemplate?.name === t.name ? 'ring-2 ring-primary' : ''}
                >
                  <p className="font-medium text-text-primary text-sm">{t.name}</p>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="success">Aprovado</Badge>
                    <span className="text-xs text-text-tertiary">{t.language}</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {variables.length > 0 && parsedData && (
        <div>
          <p className="text-sm font-medium text-text-primary mb-2">Mapeamento de Variáveis</p>
          <div className="space-y-2">
            {variables.map((v: string, i: number) => (
              <div key={v} className="flex items-center gap-3">
                <span className="text-sm text-text-secondary w-12 shrink-0">{v}</span>
                <Select
                  value={varMapping[i + 1] ?? ''}
                  onChange={e => setVarMapping({ ...varMapping, [i + 1]: e.target.value })}
                  className="flex-1"
                >
                  <option value="">Selecionar coluna...</option>
                  {parsedData.headers.map((h: string) => <option key={h} value={h}>{h}</option>)}
                </Select>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}><ChevronLeft className="h-4 w-4" /> Voltar</Button>
        <Button onClick={onNext} disabled={!selectedPhone || !selectedTemplate}>
          Próximo <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Step 3: Confirmar
function Step3({ campaignName, selectedPhone, accounts, selectedTemplate, parsedData, varMapping, onBack, onSubmit, loading }: any) {
  const [scheduledAt, setScheduledAt] = useState('');
  const [sendNow, setSendNow] = useState(true);

  const account = accounts.find((a: Account) => a.phone_number_id === selectedPhone);
  const firstRow = parsedData?.rows?.[0] ?? {};
  const bodyText = selectedTemplate?.components?.find((c: any) => c.type === 'BODY')?.text ?? '';
  const preview = bodyText.replace(/\{\{(\d+)\}\}/g, (_: string, n: string) => {
    const col = varMapping[parseInt(n)];
    return col ? (firstRow[col] ?? `{{${n}}}`) : `{{${n}}}`;
  });

  return (
    <div className="space-y-4">
      <Card padding="lg">
        <h3 className="font-medium text-text-primary mb-3">Resumo do Disparo</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-text-secondary">Campanha</dt><dd className="font-medium">{campaignName}</dd></div>
          <div className="flex justify-between"><dt className="text-text-secondary">Contatos</dt><dd className="font-medium">{parsedData?.total}</dd></div>
          <div className="flex justify-between"><dt className="text-text-secondary">Canal</dt><dd className="font-medium">{account?.name}</dd></div>
          <div className="flex justify-between"><dt className="text-text-secondary">Template</dt><dd className="font-medium">{selectedTemplate?.name}</dd></div>
        </dl>
      </Card>

      <Card>
        <p className="text-sm font-medium text-text-primary mb-2">Agendamento</p>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={sendNow} onChange={() => setSendNow(true)} />
            <span className="text-sm">Enviar agora</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={!sendNow} onChange={() => setSendNow(false)} />
            <span className="text-sm">Agendar para</span>
          </label>
          {!sendNow && (
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              className="border border-border rounded-lg px-3 py-2 text-sm w-full"
            />
          )}
        </div>
      </Card>

      {preview && (
        <Card>
          <p className="text-sm font-medium text-text-primary mb-2">Preview (1º contato)</p>
          <div className="bg-[#ECE5DD] rounded-lg p-3">
            <div className="bg-white rounded-lg p-3 shadow-sm max-w-[240px] ml-auto">
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{preview}</p>
            </div>
          </div>
        </Card>
      )}

      <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
        <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
        <p className="text-xs text-yellow-700">Esta ação é irreversível. Confirme antes de prosseguir.</p>
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}><ChevronLeft className="h-4 w-4" /> Voltar</Button>
        <Button onClick={() => onSubmit(sendNow ? null : scheduledAt)} loading={loading}>
          Confirmar Envio
        </Button>
      </div>
    </div>
  );
}

export default function CampaignWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [campaignName, setCampaignName] = useState('');
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedPhone, setSelectedPhone] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [varMapping, setVarMapping] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    fetch('/api/v2/accounts')
      .then(r => r.json())
      .then(setAccounts)
      .catch(console.error);
  }, []);

  React.useEffect(() => {
    if (!selectedPhone) return;
    setLoadingTemplates(true);
    fetch(`/api/v2/templates?phone_number_id=${selectedPhone}`)
      .then(r => r.json())
      .then(setTemplates)
      .catch(console.error)
      .finally(() => setLoadingTemplates(false));
  }, [selectedPhone]);

  const handleSubmit = async (scheduledAt: string | null) => {
    setSubmitting(true);
    try {
      const variableMapping: Record<string, string> = {};
      Object.entries(varMapping).forEach(([k, v]) => { variableMapping[`{{${k}}}`] = v; });

      const res = await fetch('/api/v2/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName,
          phone_number_id: selectedPhone,
          template_name: selectedTemplate!.name,
          template_language: selectedTemplate!.language,
          variable_mapping: variableMapping,
          contacts: parsedData!.rows,
          scheduled_at: scheduledAt,
        }),
      });
      if (!res.ok) { const e = await res.json() as any; alert(e.error ?? 'Erro ao criar campanha'); return; }
      navigate('/painel/campanhas');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-text-primary mb-6">Nova Campanha</h1>
      <StepIndicator current={step} />

      {step === 0 && (
        <Step1
          campaignName={campaignName}
          setCampaignName={setCampaignName}
          parsedData={parsedData}
          setParsedData={setParsedData}
          onNext={() => setStep(1)}
        />
      )}
      {step === 1 && (
        <Step2
          accounts={accounts}
          selectedPhone={selectedPhone}
          setSelectedPhone={setSelectedPhone}
          templates={templates}
          loadingTemplates={loadingTemplates}
          selectedTemplate={selectedTemplate}
          setSelectedTemplate={setSelectedTemplate}
          varMapping={varMapping}
          setVarMapping={setVarMapping}
          parsedData={parsedData}
          onBack={() => setStep(0)}
          onNext={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <Step3
          campaignName={campaignName}
          selectedPhone={selectedPhone}
          accounts={accounts}
          selectedTemplate={selectedTemplate}
          parsedData={parsedData}
          varMapping={varMapping}
          onBack={() => setStep(1)}
          onSubmit={handleSubmit}
          loading={submitting}
        />
      )}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/frontend/pages/campaigns/CampaignWizard.tsx
git commit -m "feat(screen): CampaignWizard refatorado — nova ordem Upload→Canal→Confirmar"
```

---

## Task 11: Screen 4 — CampaignList refactor

**Files:**
- Modify: `src/frontend/pages/campaigns/CampaignList.tsx`

**Step 1: Ler o arquivo atual antes de modificar**

**Step 2: Substituir CampaignList.tsx**

```tsx
// src/frontend/pages/campaigns/CampaignList.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Megaphone } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';

interface Campaign {
  id: string;
  name: string;
  status: string;
  total_contacts: number;
  sent?: number;
  created_at: string;
  phone_number_id: string;
}

const statusVariant: Record<string, 'success' | 'warning' | 'error' | 'default' | 'info'> = {
  done: 'success', running: 'info', paused: 'warning', cancelled: 'error', pending: 'default',
};
const statusLabel: Record<string, string> = {
  done: 'Concluída', running: 'Em andamento', paused: 'Pausada', cancelled: 'Cancelada', pending: 'Pendente',
};

export default function CampaignList() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v2/campaigns')
      .then(r => r.json())
      .then(setCampaigns)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const total = campaigns.length;
  const active = campaigns.filter(c => ['running', 'paused', 'pending'].includes(c.status)).length;
  const done = campaigns.filter(c => c.status === 'done').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Campanhas</h1>
        <Button onClick={() => navigate('/painel/campanhas/nova')}>
          <Plus className="h-4 w-4" />
          Nova Campanha
        </Button>
      </div>

      {/* Métricas rápidas */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total', value: total },
          { label: 'Ativas', value: active },
          { label: 'Concluídas', value: done },
        ].map(({ label, value }) => (
          <Card key={label} padding="sm" className="text-center">
            <p className="text-2xl font-bold text-text-primary">{value}</p>
            <p className="text-xs text-text-secondary">{label}</p>
          </Card>
        ))}
      </div>

      {loading && <p className="text-sm text-text-secondary">Carregando...</p>}

      <div className="space-y-3">
        {campaigns.map(c => {
          const sent = c.sent ?? 0;
          const pct = c.total_contacts > 0 ? Math.round((sent / c.total_contacts) * 100) : 0;
          return (
            <Card key={c.id} hover onClick={() => navigate(`/painel/campanhas/${c.id}`)}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-text-primary text-sm truncate">{c.name}</p>
                  <p className="text-xs text-text-tertiary mt-0.5">
                    {new Date(c.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <Badge variant={statusVariant[c.status] ?? 'default'}>
                  {statusLabel[c.status] ?? c.status}
                </Badge>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-bg-default rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-text-tertiary shrink-0">{sent}/{c.total_contacts}</span>
              </div>
            </Card>
          );
        })}
      </div>

      {!loading && campaigns.length === 0 && (
        <div className="text-center py-12 text-text-secondary">
          <Megaphone className="h-10 w-10 mx-auto mb-3 text-text-tertiary" />
          <p className="font-medium">Nenhuma campanha criada</p>
          <p className="text-sm mt-1">Clique em "Nova Campanha" para começar</p>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/frontend/pages/campaigns/CampaignList.tsx
git commit -m "feat(screen): CampaignList com métricas rápidas e barra de progresso"
```

---

## Task 12: Screen 9 — CampaignDetail refactor

**Files:**
- Modify: `src/frontend/pages/campaigns/CampaignDetail.tsx`

**Step 1: Ler o arquivo atual antes de modificar**

**Step 2: Substituir CampaignDetail.tsx**

```tsx
// src/frontend/pages/campaigns/CampaignDetail.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, CheckCircle2, BookOpen, Users } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';

interface Campaign {
  id: string;
  name: string;
  status: string;
  total_contacts: number;
  template_name: string;
  created_at: string;
}

interface Contact {
  id: number;
  phone: string;
  status: string;
  sent_at: string | null;
  error_message: string | null;
}

interface Metrics { total: number; sent: number; delivered: number; read: number; failed: number; }

const statusVariant: Record<string, any> = {
  done: 'success', running: 'info', paused: 'warning', cancelled: 'error', pending: 'default',
};
const statusLabel: Record<string, string> = {
  done: 'Concluída', running: 'Em andamento', paused: 'Pausada', cancelled: 'Cancelada', pending: 'Pendente',
};
const contactStatusVariant: Record<string, any> = {
  sent: 'info', delivered: 'success', read: 'success', failed: 'error', pending: 'default', cancelled: 'default',
};

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    const [cRes, ctRes] = await Promise.all([
      fetch(`/api/v2/campaigns/${id}`),
      fetch(`/api/v2/campaigns/${id}/contacts${filterStatus ? `?status=${filterStatus}` : ''}`),
    ]);
    const cData = await cRes.json() as any;
    const ctData = await ctRes.json() as any;
    setCampaign(cData.campaign ?? cData);
    setMetrics(cData.metrics ?? null);
    setContacts(ctData.contacts ?? ctData ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id, filterStatus]);

  useEffect(() => {
    if (campaign?.status === 'running') {
      pollingRef.current = setInterval(load, 5000);
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [campaign?.status]);

  const doAction = async (action: string) => {
    await fetch(`/api/v2/campaigns/${id}/${action}`, { method: 'POST' });
    load();
  };

  if (loading) return <div className="p-6 text-sm text-text-secondary">Carregando...</div>;
  if (!campaign) return <div className="p-6 text-sm text-red-600">Campanha não encontrada.</div>;

  const m = metrics ?? { total: campaign.total_contacts, sent: 0, delivered: 0, read: 0, failed: 0 };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate('/painel/campanhas')} className="text-text-tertiary hover:text-text-primary">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-semibold text-text-primary flex-1 min-w-0 truncate">{campaign.name}</h1>
        <Badge variant={statusVariant[campaign.status] ?? 'default'}>
          {statusLabel[campaign.status] ?? campaign.status}
        </Badge>
        {campaign.status === 'running' && (
          <Button variant="secondary" size="sm" onClick={() => doAction('pause')}>Pausar</Button>
        )}
        {campaign.status === 'paused' && (
          <Button size="sm" onClick={() => doAction('resume')}>Retomar</Button>
        )}
        {['running', 'paused', 'pending'].includes(campaign.status) && (
          <Button variant="danger" size="sm" onClick={() => doAction('cancel')}>Cancelar</Button>
        )}
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: m.total, icon: Users, color: 'text-text-secondary' },
          { label: 'Enviado', value: m.sent, icon: Send, color: 'text-primary' },
          { label: 'Entregue', value: m.delivered, icon: CheckCircle2, color: 'text-green-600' },
          { label: 'Lido', value: m.read, icon: BookOpen, color: 'text-blue-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <div className="flex items-center gap-3">
              <Icon className={`h-5 w-5 shrink-0 ${color}`} />
              <div>
                <p className="text-2xl font-bold text-text-primary">{value}</p>
                <p className="text-xs text-text-secondary">{label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Tabela de contatos */}
      <Card padding="lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-text-primary">Contatos</h2>
          <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-40">
            <option value="">Todos</option>
            <option value="pending">Pendente</option>
            <option value="sent">Enviado</option>
            <option value="delivered">Entregue</option>
            <option value="read">Lido</option>
            <option value="failed">Falhou</option>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-text-secondary">
                <th className="text-left py-2 pr-4 font-medium">Telefone</th>
                <th className="text-left py-2 pr-4 font-medium">Status</th>
                <th className="text-left py-2 pr-4 font-medium">Enviado em</th>
                <th className="text-left py-2 font-medium">Erro</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4 text-text-primary font-mono text-xs">{c.phone}</td>
                  <td className="py-2 pr-4">
                    <Badge variant={contactStatusVariant[c.status] ?? 'default'}>{c.status}</Badge>
                  </td>
                  <td className="py-2 pr-4 text-text-tertiary text-xs">
                    {c.sent_at ? new Date(c.sent_at).toLocaleString('pt-BR') : '—'}
                  </td>
                  <td className="py-2 text-red-600 text-xs">{c.error_message ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {contacts.length === 0 && (
            <p className="text-sm text-text-secondary py-4 text-center">Nenhum contato encontrado.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/frontend/pages/campaigns/CampaignDetail.tsx
git commit -m "feat(screen): CampaignDetail com polling, 4 métricas e tabela filtrável"
```

---

## Task 13: Screen 2 — ConversationList refactor (tabs + accordion)

**Files:**
- Modify: `src/frontend/pages/conversations/ConversationList.tsx`

**Step 1: Ler o arquivo atual antes de modificar**

**Step 2: Substituir ConversationList.tsx**

```tsx
// src/frontend/pages/conversations/ConversationList.tsx
import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import ConversationView from './ConversationView';

interface Conversation {
  contact_phone: string;
  last_at: string;
  last_content: string;
  phone_number_id: string;
  account_name?: string;
}

const TABS = ['Todas', 'IA', 'Minhas', 'Outras', 'Abertas'];

export default function ConversationList() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeTab, setActiveTab] = useState('Todas');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();
  const params = useParams();

  useEffect(() => {
    fetch('/api/v2/conversations')
      .then(r => r.json())
      .then(setConversations)
      .catch(console.error);
  }, []);

  // Agrupar por phone_number_id
  const grouped = conversations.reduce<Record<string, Conversation[]>>((acc, c) => {
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
          <Route path=":phone" element={<ConversationView />} />
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
```

**Step 3: Commit**

```bash
git add src/frontend/pages/conversations/ConversationList.tsx
git commit -m "feat(screen): ConversationList com tabs e accordion por conta"
```

---

## Task 14: Screen 6 — Settings.tsx + endpoint /api/v2/config

**Files:**
- Create: `src/frontend/pages/settings/Settings.tsx`

*Nota: O endpoint `/api/v2/config` já foi criado na Task 6.*

**Step 1: Criar Settings.tsx**

```tsx
// src/frontend/pages/settings/Settings.tsx
import React, { useState, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';
import { Card } from '../../components/ui/Card';

interface Config {
  version: string;
  base_url: string;
  webhook_url: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="p-1.5 rounded hover:bg-bg-default text-text-tertiary transition-colors">
      {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card padding="lg">
      <h2 className="text-sm font-semibold text-text-primary mb-4">{title}</h2>
      <div className="space-y-3">{children}</div>
    </Card>
  );
}

function Field({ label, value, masked }: { label: string; value: string; masked?: boolean }) {
  const display = masked ? '••••••••' + value.slice(-4) : value;
  return (
    <div>
      <p className="text-xs text-text-secondary mb-1">{label}</p>
      <div className="flex items-center gap-2 bg-bg-default rounded-lg px-3 py-2">
        <code className="text-sm text-text-primary flex-1 min-w-0 truncate">{display}</code>
        <CopyButton text={value} />
      </div>
    </div>
  );
}

export default function Settings() {
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    fetch('/api/v2/config')
      .then(r => r.json())
      .then(setConfig)
      .catch(console.error);
  }, []);

  if (!config) return <div className="p-6 text-sm text-text-secondary">Carregando...</div>;

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-text-primary">Configurações</h1>

      <Section title="Sistema">
        <Field label="Versão" value={config.version} />
        <Field label="URL Base" value={config.base_url} />
      </Section>

      <Section title="Webhook">
        <Field label="URL do Webhook" value={config.webhook_url} />
      </Section>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/frontend/pages/settings/Settings.tsx
git commit -m "feat(screen): Settings com seções Sistema e Webhook"
```

---

## Verificação Final

**Step 1: Rodar o servidor**

```bash
bun src/server.ts
```

**Step 2: Checklist de rotas**

- [ ] `/painel` → redireciona para `/painel/dashboard`
- [ ] `/painel/dashboard` → 4 metric cards, seletor de conta, campanhas recentes
- [ ] `/painel/contas` → grid de cards com ações (editar, toggle, excluir)
- [ ] `/painel/templates` → cards com badge de status, botão "Novo Template" abre modal
- [ ] `/painel/campanhas` → métricas rápidas, lista com barra de progresso
- [ ] `/painel/campanhas/nova` → wizard 3 steps (Upload → Canal → Confirmar)
- [ ] `/painel/campanhas/:id` → 4 métricas, tabela filtrável, polling quando running
- [ ] `/painel/conversas` → sidebar com tabs + accordion, área de chat
- [ ] `/painel/configuracoes` → seções Sistema e Webhook
- [ ] Sidebar ativa o item correto por rota

**Step 3: Commit final**

```bash
git add -A
git commit -m "chore: verificação final — todas as 9 telas implementadas"
```

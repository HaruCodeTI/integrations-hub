# Design: Redesign UI — Implementação do layout.pen

**Data:** 2026-03-20
**Status:** Aprovado
**Escopo:** Frontend completo + novas APIs (Dashboard, Contas)

---

## Contexto

O integrations-hub tem backend funcional (campanhas, templates, conversas, contas) mas o frontend é um React SPA com Tailwind CDN sem fidelidade ao design. O layout.pen define 9 telas com design system consistente. Este documento especifica a implementação completa guiada pelo layout.pen.

---

## Abordagem: Design System First

Criar tokens Tailwind + componentes base antes das telas. Garante consistência visual e facilita manutenção.

---

## Design System

### Tokens de Cor (`tailwind.config.ts`)

```ts
colors: {
  primary: {
    DEFAULT: '#4F46E5',  // $primary
    light:   '#EEF2FF',  // $primary-light
    dark:    '#3730A3',
  },
  text: {
    primary:   '#111827',
    secondary: '#6B7280',
    tertiary:  '#9CA3AF',
  },
  bg: {
    white:   '#FFFFFF',
    default: '#F9FAFB',
  },
  border: {
    DEFAULT: '#E5E7EB',
    strong:  '#D1D5DB',
  },
},
borderRadius: {
  md: '8px',
  lg: '12px',
  xl: '16px',
},
```

### Componentes Base (`src/frontend/components/ui/`)

| Componente | Variants |
|---|---|
| `Button` | primary, secondary, ghost, danger |
| `Badge` | success (verde), warning (amarelo), error (vermelho), default (cinza) |
| `Card` | padding sm/md/lg, opcional hover |
| `Input` | text, number, datetime-local |
| `Select` | estilizado com chevron |
| `Textarea` | resize vertical, char count opcional |

### Ícones

`lucide-react` — instalado via `bun add lucide-react`.

### Sidebar (`src/frontend/components/Sidebar.tsx`)

- Logo HaruCode + subtítulo "Painel" no topo
- Avatar do usuário (inicial do nome)
- 6 nav items com ícone Lucide + label:
  - Dashboard (`LayoutDashboard`)
  - Conversas (`MessageCircle`)
  - Templates (`FileText`)
  - Campanhas (`Megaphone`)
  - Contas (`Smartphone`)
  - Configurações (`Settings`)
- Estado ativo: `bg-primary-light text-primary font-semibold`
- Estado inativo: `text-text-secondary hover:bg-bg-default`
- Rodapé: link para `/admin`

---

## Novas Rotas de API

| Rota | Método | Status | Descrição |
|---|---|---|---|
| `/api/v2/dashboard/:phone_id` | GET | 🆕 novo | Métricas agregadas do SQLite |
| `/api/v2/accounts` | GET | 🆕 novo | Listar todos os clients |
| `/api/v2/accounts` | POST | 🆕 novo | Criar novo client |
| `/api/v2/accounts/:id` | PATCH | 🆕 novo | Editar client |
| `/api/v2/accounts/:id` | DELETE | 🆕 novo | Desativar/excluir client |

---

## Telas

### Screen 1 — Dashboard

**Rota:** `/painel` (redireciona para `/painel/dashboard`)

**Dados:** `GET /api/v2/dashboard/:phone_id`
```ts
{
  messages_sent_7d: number,
  delivery_rate: number,      // %
  read_rate: number,          // %
  active_campaigns: number,
  recent_campaigns: Campaign[]  // últimas 5
}
```

**UI:**
- Seletor de conta no topo
- 4 metric cards: Enviadas (7d), Taxa de Entrega, Taxa de Leitura, Campanhas Ativas
- Lista das últimas 5 campanhas com status badge e barra de progresso

---

### Screen 2 — Conversas

**Rota:** `/painel/conversas`

**Mudanças:**
- Sidebar esquerda ganha tabs: Todas | IA | Minhas | Outras | Abertas
- Accordion por conta (agrupar por `phone_number_id`)
- Cada item: avatar circular com inicial, nome/telefone, preview última mensagem, timestamp, badge (NÃO ATRIBUÍDO/ABERTO)

---

### Screen 3 — Templates

**Rota:** `/painel/templates`

**Mudanças:**
- Lista em cards com badge de status (APROVADO=verde, REJEITADO=vermelho, PENDENTE=amarelo)
- Preview do corpo do template
- Botão "Novo Template" abre **modal** (Screen 7) em vez de navegar

---

### Screen 4 — Campanhas

**Rota:** `/painel/campanhas`

**Mudanças:**
- Header com 3 métricas rápidas (total, ativas, concluídas)
- Cards com barra de progresso (enviados/total)
- Badge de status colorido por estado
- CTA "Nova Campanha" navega para wizard

---

### Screen 5 — Canais (Contas)

**Rota:** `/painel/contas`

**Novo módulo:** `src/modules/accounts/`

**UI:**
- Grid de cards: avatar colorido + ícone WA + nome + número + badge ATIVA/INATIVA
- Botão "Conectar nova conta" → redireciona para `/signup` (OAuth flow existente)
- Menu de ações por card: editar nome, toggle ativo/inativo, excluir

---

### Screen 6 — Configurações

**Rota:** `/painel/configuracoes`

**UI simples:**
- Seção "Sistema": versão da app, URL base
- Seção "Webhook": URL do webhook exibida para copiar
- Seção "API": chave de API (mascarada) com botão copiar
- Dados lidos do `.env` via endpoint `GET /api/v2/config` (retorna só campos públicos)

---

### Screen 7 — Template Builder (Modal)

**Ativação:** Botão "Novo Template" na Screen 3

**Payload Meta API:**
```json
{
  "name": "nome_do_template",
  "category": "MARKETING",
  "language": "pt_BR",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "Título" },
    { "type": "BODY", "text": "Olá {{1}}, ..." },
    { "type": "FOOTER", "text": "Rodapé opcional" },
    { "type": "BUTTONS", "buttons": [
      { "type": "QUICK_REPLY", "text": "Sim" },
      { "type": "URL", "text": "Ver site", "url": "https://..." },
      { "type": "COPY_CODE", "example": ["CUPOM10"] }
    ]}
  ]
}
```

**UI:**
- Modal 900×740px com overlay escuro
- Coluna esquerda: formulário (nome, categoria, idioma, cabeçalho, corpo com toolbar B/I/S, rodapé, botões)
- Coluna direita: preview WhatsApp ao vivo (bolha com variáveis substituídas por exemplos)
- Seção botões: dropdown tipo (Resposta rápida / Acessar site / Copiar código)
- Botão "+ Variável" insere `{{N}}` na posição do cursor

---

### Screen 8 — Campaign Wizard

**Rota:** `/painel/campanhas/nova`

**Step 1 — Upload da Lista:**
- Campo: nome da campanha
- Drag-drop + input de arquivo CSV/XLSX
- Preview da tabela após upload (5 primeiras linhas)
- Validação: coluna `telefone` obrigatória

**Step 2 — Canal & Template:**
- Grid de cards de contas (seleção exclusiva)
- Lista de templates APROVADOS (busca via API, seleção exclusiva)
- Mapeamento automático de variáveis: `{{1}}` → dropdown com colunas do CSV

**Step 3 — Confirmar Disparo:**
- Resumo: nome, contatos, canal, template
- Agendamento: "Enviar agora" ou datetime-local
- Preview WhatsApp com variáveis do primeiro contato
- Warning de ação irreversível
- Botão "Confirmar Envio"

---

### Screen 9 — Detalhe de Campanha

**Rota:** `/painel/campanhas/:id`

**Mudanças:**
- Header: nome + status badge + botões Pausar/Cancelar (quando aplicável)
- 4 metric cards: Total, Enviado, Entregue, Lido
- Tabela de contatos com colunas: telefone, status, enviado em, erro
- Filtro por status na tabela
- Polling a cada 5s quando campanha está `running`

---

## Estrutura de Arquivos Final

```
src/
├── frontend/
│   ├── index.html                        # remove CDN, aponta para CSS compilado
│   ├── styles/globals.css                # @tailwind + variáveis
│   ├── App.tsx                           # rotas atualizadas
│   ├── components/
│   │   ├── Sidebar.tsx                   # 🆕
│   │   ├── ui/
│   │   │   ├── Button.tsx                # 🆕
│   │   │   ├── Badge.tsx                 # 🆕
│   │   │   ├── Card.tsx                  # 🆕
│   │   │   ├── Input.tsx                 # 🆕
│   │   │   └── Select.tsx                # 🆕
│   │   ├── AccountSelector.tsx           # ✏️ usa novos ui components
│   │   └── TemplateBuilderModal.tsx      # 🆕
│   └── pages/
│       ├── Dashboard.tsx                 # 🆕
│       ├── accounts/AccountList.tsx      # 🆕
│       ├── settings/Settings.tsx         # 🆕
│       ├── conversations/
│       │   ├── ConversationList.tsx      # ✏️
│       │   └── ConversationView.tsx      # ✏️
│       ├── templates/
│       │   ├── TemplateList.tsx          # ✏️
│       │   └── TemplateForm.tsx          # ✏️ (mantido para rota /novo, integra modal)
│       └── campaigns/
│           ├── CampaignList.tsx          # ✏️
│           ├── CampaignWizard.tsx        # ✏️ nova ordem de steps
│           └── CampaignDetail.tsx        # ✏️
├── modules/
│   └── accounts/
│       ├── accounts.controller.ts        # 🆕
│       ├── accounts.routes.ts            # 🆕
│       └── accounts.service.ts           # 🆕
└── tailwind.config.ts                    # 🆕
```

---

## Sequência de Implementação

1. Setup (Tailwind config + build CSS + lucide-react)
2. Componentes base UI (Button, Badge, Card, Input, Select)
3. Sidebar + Layout + App.tsx com todas as rotas
4. API: Dashboard + Accounts modules
5. Screen 1: Dashboard
6. Screen 5: Contas (AccountList)
7. Screen 3: Templates + Template Builder Modal (Screen 7)
8. Screen 8: Campaign Wizard (refatorado)
9. Screen 4: Campaign List
10. Screen 9: Campaign Detail
11. Screen 2: Conversas
12. Screen 6: Configurações

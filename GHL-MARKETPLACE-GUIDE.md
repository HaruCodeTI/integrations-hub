# HaruCode WhatsApp Gateway — Guia de Publicação no GHL Marketplace

## Resumo

Este guia contém tudo que você precisa para submeter o app **HaruCode WhatsApp Gateway** no GoHighLevel Marketplace. Inclui textos prontos para copiar, configurações necessárias e checklist de verificação.

---

## 1. Configuração no Developer Portal

Acesse: **https://marketplace.gohighlevel.com** → seu app existente

### 1.1 Basic Info

| Campo | Valor |
|-------|-------|
| **App Name** | HaruCode WhatsApp Gateway |
| **App Description** | Conecte seu WhatsApp Business API diretamente ao GoHighLevel. Envie e receba mensagens de texto, imagens, vídeos, áudios e documentos — tudo dentro do GHL Conversations. Suporte a múltiplas locations, status de entrega/leitura em tempo real e media bidirecional. |
| **Short Description** | WhatsApp Business API integration for GHL Conversations with full media support. |
| **Category** | Messaging / Communication |
| **Distribution** | Sub-Account (Location) Level |
| **Developer Name** | HaruCode |
| **Developer Email** | guitarumoto@gmail.com |
| **Support Email** | guitarumoto@gmail.com |
| **Website** | https://gateway.harucode.com.br |
| **Privacy Policy URL** | https://gateway.harucode.com.br/privacy |
| **Terms of Service URL** | https://gateway.harucode.com.br/terms |

### 1.2 Descrição Longa (para o listing)

```
HaruCode WhatsApp Gateway conecta sua conta WhatsApp Business API diretamente ao GoHighLevel, permitindo que você gerencie todas as conversas de WhatsApp dentro do CRM.

Funcionalidades:
- Mensagens de texto bidirecionais (WhatsApp ↔ GHL)
- Suporte completo a mídia: imagens, vídeos, áudios e documentos
- Status em tempo real: enviado, entregue e lido
- Multi-location: conecte múltiplas sub-accounts ao mesmo gateway
- Criação automática de contatos no GHL
- OAuth seguro com refresh automático de tokens

Como funciona:
1. Instale o app na sua sub-account
2. O gateway conecta automaticamente via OAuth
3. As mensagens do WhatsApp aparecem no GHL Conversations
4. Responda diretamente pelo GHL — a mensagem chega no WhatsApp do cliente

Requisitos:
- Conta WhatsApp Business API (via Meta Cloud API)
- Phone Number ID registrado no gateway HaruCode
```

---

## 2. OAuth & Scopes

### 2.1 Scopes Necessários

No Developer Portal, marque estes scopes:

| Scope | Motivo |
|-------|--------|
| `conversations/message.readonly` | Ler mensagens para status tracking |
| `conversations/message.write` | Enviar mensagens inbound para o GHL |
| `contacts.readonly` | Buscar contatos por telefone |
| `contacts.write` | Criar novos contatos automaticamente |

### 2.2 OAuth URLs

| Campo | URL |
|-------|-----|
| **Redirect URI** | `https://gateway.harucode.com.br/integrations/oauth/callback` |
| **Install URL** | `https://gateway.harucode.com.br/integrations/install` |

---

## 3. Conversation Provider

### 3.1 Configuração no Developer Portal

No app, vá em **Marketplace Modules** → **Conversation Providers** e configure:

| Campo | Valor |
|-------|-------|
| **Provider Name** | HaruCode WhatsApp |
| **Provider Type** | Custom |
| **Supported Channels** | SMS (o GHL usa "SMS" como tipo para Custom Providers) |
| **Outbound Webhook URL** | `https://gateway.harucode.com.br/integrations/webhook/outbound` |

O `conversationProviderId` gerado precisa estar no `.env` do servidor como `GHL_CONVERSATION_PROVIDER_ID`.

---

## 4. Webhook Configuration

### 4.1 Endpoints do Gateway

| Endpoint | Método | Propósito |
|----------|--------|-----------|
| `/webhook` | POST | Recebe webhooks da Meta (mensagens WhatsApp) |
| `/integrations/install` | GET | Inicia fluxo OAuth do GHL |
| `/integrations/oauth/callback` | GET | Callback do OAuth |
| `/integrations/webhook/outbound` | POST | Recebe mensagens do GHL para enviar via WhatsApp |
| `/media/:token` | GET | Proxy de mídia protegido por HMAC |
| `/health` | GET | Health check |
| `/privacy` | GET | Política de Privacidade |
| `/terms` | GET | Termos de Uso |
| `/docs` | GET | Documentação da API (Scalar) |

---

## 5. Variáveis de Ambiente (.env)

Confirme que todas estas variáveis estão configuradas no servidor:

```env
# Meta / WhatsApp
META_VERIFY_TOKEN=<seu_token_de_verificação>
META_APP_SECRET=<seu_app_secret>

# Gateway
GATEWAY_API_KEY=<sua_api_key>
GATEWAY_PUBLIC_URL=https://gateway.harucode.com.br
PORT=3000

# GHL Marketplace
GHL_CLIENT_ID=<do_developer_portal>
GHL_CLIENT_SECRET=<do_developer_portal>
GHL_CONVERSATION_PROVIDER_ID=<gerado_ao_criar_o_provider>
GHL_APP_VERSION_ID=<version_id_do_app>
GHL_SCOPES=conversations/message.readonly conversations/message.write contacts.readonly contacts.write
```

---

## 6. Checklist Antes de Submeter

### Técnico
- [ ] Servidor rodando e acessível em `https://gateway.harucode.com.br`
- [ ] `/health` retornando `{"status":"ok"}`
- [ ] `/privacy` carregando a página de Política de Privacidade
- [ ] `/terms` carregando os Termos de Uso
- [ ] OAuth flow funcionando (install → callback → tokens salvos)
- [ ] Mensagens inbound (WhatsApp → GHL) funcionando
- [ ] Mensagens outbound (GHL → WhatsApp) funcionando
- [ ] Mídia inbound (imagens, vídeos, docs) funcionando
- [ ] Mídia outbound funcionando
- [ ] Status delivered/read atualizando no GHL
- [ ] Token refresh automático funcionando

### Developer Portal
- [ ] App Name preenchido
- [ ] Descrição curta e longa preenchidas
- [ ] Ícone do app uploaded (recomendado: 512x512 PNG)
- [ ] Screenshots do app em funcionamento (mínimo 2-3)
- [ ] Scopes corretos selecionados
- [ ] Redirect URI configurada corretamente
- [ ] Conversation Provider criado e configurado
- [ ] Outbound Webhook URL configurada
- [ ] Privacy Policy URL preenchida
- [ ] Terms of Service URL preenchida
- [ ] Version ID no `.env` do servidor

### Screenshots Sugeridas
1. Conversa no GHL Conversations mostrando mensagens bidirecionais
2. Mensagem com imagem recebida no GHL (mostrando preview)
3. Tela de instalação/OAuth (página de sucesso)

---

## 7. Submissão

1. No Developer Portal, vá em **Basic Info**
2. Revise todas as configurações
3. Clique em **Submit for Review**
4. O time do GHL revisa em **7-10 dias úteis**
5. Após aprovação, o app fica disponível no Marketplace

### Se for rejeitado
- Leia o feedback do time de review
- Corrija os pontos solicitados
- Resubmeta

---

## 8. Pós-Publicação

Após aprovação:
- O app aparece no GHL Marketplace para todos os usuários
- Clientes podem instalar diretamente pela UI do GHL
- Cada instalação passa pelo OAuth flow e cria automaticamente a location
- Monitore logs do servidor para garantir estabilidade

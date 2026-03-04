# Guia de Configuração — Do Zero à Produção

Este guia cobre todo o processo para colocar o WhatsApp Omni Gateway em produção, desde a criação do servidor até o envio da primeira mensagem.

## Pré-requisitos

- Conta na [DigitalOcean](https://digitalocean.com) (ou VPS equivalente)
- Domínio próprio (ex: `gateway.suaempresa.com.br`)
- Conta no [Meta for Developers](https://developers.facebook.com)
- Conta no [Meta Business Manager](https://business.facebook.com)
- Número de telefone dedicado para o WhatsApp Business (chip limpo, sem WhatsApp pessoal)
- Instância do [n8n](https://n8n.io) rodando (self-hosted ou cloud)

---

## Fase 1: Servidor (DigitalOcean)

### 1.1 Criar o Droplet

- Acesse a DigitalOcean e crie um Droplet.
- **Plano:** Basic — $6/mês (1 vCPU, 1GB RAM, 25GB SSD) é suficiente.
- **Imagem:** Ubuntu 24.04 LTS.
- **Região:** Escolha a mais próxima dos seus usuários (NYC para o Brasil tem boa latência).
- **Autenticação:** Use chaves SSH (nunca senha root).
- **Ative o Reserved IP:** Isso garante que o IP não mude se você recriar o droplet. Use este IP no DNS do seu domínio.

### 1.2 Configuração Inicial do Ubuntu

```bash
ssh root@SEU_IP_RESERVADO

# Atualizar sistema
apt update && apt upgrade -y

# Instalar ferramentas essenciais
apt install -y git curl ufw
```

### 1.3 Configurar Firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

### 1.4 Instalar o Bun

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun --version  # Deve mostrar v1.3+
```

### 1.5 Instalar Nginx + Certbot

A Meta exige HTTPS para webhooks. Nginx atua como proxy reverso (HTTPS:443 → Bun:3000).

```bash
apt install -y nginx certbot python3-certbot-nginx
```

### 1.6 Configurar DNS

No painel do seu provedor de domínio, crie um registro A:

```
gateway.suaempresa.com.br → SEU_IP_RESERVADO
```

Aguarde a propagação DNS (pode levar alguns minutos até 48h).

### 1.7 Configurar Nginx como Proxy Reverso

Crie o arquivo de configuração:

```bash
nano /etc/nginx/sites-available/wa-gateway
```

Conteúdo:

```nginx
server {
    listen 80;
    server_name gateway.suaempresa.com.br;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Ativar e testar:

```bash
ln -s /etc/nginx/sites-available/wa-gateway /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### 1.8 Gerar Certificado SSL

```bash
certbot --nginx -d gateway.suaempresa.com.br
```

O Certbot configura automaticamente o redirect HTTP→HTTPS e a renovação automática.

### 1.9 Deploy da Aplicação

```bash
# Clonar o repositório
cd /var/www
git clone <repo-url> wa-omni-gateway
cd wa-omni-gateway

# Instalar dependências
bun install

# Criar arquivo .env
cp .env.example .env
nano .env  # Preencher com valores reais (veja Fase 2)
```

### 1.10 Configurar Systemd (Processo Permanente)

Crie o serviço:

```bash
nano /etc/systemd/system/wa-gateway.service
```

Conteúdo:

```ini
[Unit]
Description=WhatsApp Omni Gateway (Bun)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/wa-omni-gateway
ExecStart=/root/.bun/bin/bun src/server.ts
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=wa-omni-gateway
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Ativar e iniciar:

```bash
systemctl daemon-reload
systemctl enable wa-gateway
systemctl start wa-gateway
```

### 1.11 Verificar

```bash
# Status do serviço
systemctl status wa-gateway

# Logs em tempo real
journalctl -u wa-gateway -f

# Health check externo
curl https://gateway.suaempresa.com.br/health
```

---

## Fase 2: Meta for Developers

### 2.1 Criar o Aplicativo

1. Acesse [developers.facebook.com](https://developers.facebook.com).
2. Clique em **Meus Apps → Criar App**.
3. Tipo: **Negócios (Business)**.
4. Vincule ao seu **Gerenciador de Negócios** (Business Manager).
5. Adicione o produto **WhatsApp** ao app.

### 2.2 Obter o App Secret

1. No painel do app, vá em **Configurações → Básico**.
2. Copie a **Chave Secreta do Aplicativo** (App Secret).
3. Coloque no `.env` do servidor como `META_APP_SECRET`.

### 2.3 Criar uma Conta WhatsApp Business (WABA)

Se você ainda não tem uma WABA além da conta de teste, crie uma no **Business Manager**:

1. Acesse [business.facebook.com](https://business.facebook.com).
2. Vá em **Configurações → Contas → Contas do WhatsApp**.
3. Clique em **Adicionar** e siga o fluxo de criação.

### 2.4 Registrar Número de Telefone

1. No **Gerenciador do WhatsApp**, selecione sua WABA.
2. Vá em **Números de telefone → Adicionar telefone**.
3. Insira o número dedicado e verifique por SMS ou ligação.
4. Aguarde o status mudar para **"Conectado"**.
5. Anote o **Phone Number ID** — você vai precisar dele.

**Importante:** Use um chip limpo, que nunca teve WhatsApp pessoal registrado. Se o número já foi usado com WhatsApp, desinstale o app e aguarde alguns dias antes de registrar na API.

### 2.5 Criar System User e Token Permanente

O token da tela de teste expira em 1 hora. Para produção, crie um token permanente:

1. No Business Manager, vá em **Configurações → Usuários → Usuários do Sistema**.
2. Clique em **Adicionar** e crie um usuário (ex: `wa-gateway`).
3. **Acesso:** Admin.
4. Clique em **Atribuir ativos** e dê acesso a:
   - Seu **App** (Controle total)
   - Sua **WABA** (Controle total)
5. Clique em **Gerar token** com as permissões:
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`
6. **Copie e salve o token** — ele só é exibido uma vez.

### 2.6 Configurar o Webhook

1. No painel do app, vá em **WhatsApp → Configuração**.
2. Na seção Webhook, clique em **Editar**.
3. Configure:
   - **Callback URL:** `https://gateway.suaempresa.com.br/webhook`
   - **Verify Token:** O mesmo valor do `META_VERIFY_TOKEN` no seu `.env`
4. Clique em **Verificar e Salvar**.
5. Na lista de campos, ative o toggle **"Assinar"** no campo `messages`.

### 2.7 Inscrever a WABA no App (CRÍTICO)

Este passo é frequentemente esquecido e causa o problema de webhooks não chegarem:

```bash
curl -X POST \
  "https://graph.facebook.com/v25.0/SEU_WABA_ID/subscribed_apps" \
  -H "Authorization: Bearer SEU_TOKEN_PERMANENTE"
```

Resposta esperada: `{"success": true}`

**Como encontrar o WABA ID:** No Business Manager → Configurações → Contas do WhatsApp → clique na conta → copie o "Identificador da conta".

### 2.8 Configurar Política de Privacidade e Termos

Para colocar o app em modo **"Ao vivo"** (Live):

1. No app, vá em **Configurações → Básico**.
2. Preencha:
   - **URL da Política de Privacidade:** `https://gateway.suaempresa.com.br/privacy`
   - **URL dos Termos de Uso:** `https://gateway.suaempresa.com.br/terms`
3. Mude o toggle **Modo do aplicativo** para **"Ao vivo"**.

---

## Fase 3: n8n

### 3.1 Criar Workflow de Resposta

1. No n8n, crie um novo workflow.
2. Adicione um nó **Webhook** (POST).
3. Adicione um nó **HTTP Request** conectado ao webhook.

### 3.2 Configurar o HTTP Request

- **Método:** POST
- **URL:** `https://graph.facebook.com/v25.0/{{ $json.body.entry[0].changes[0].value.metadata.phone_number_id }}/messages`
  (ative o modo expressão `fx` no campo URL)
- **Headers:**
  - `Authorization`: `Bearer SEU_TOKEN_PERMANENTE`
- **Body (JSON com expressão):**

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "{{ $json.body.entry[0].changes[0].value.messages[0].from }}",
  "type": "text",
  "text": { "body": "Sua resposta aqui" }
}
```

**Importante:** O payload chega dentro de `$json.body` no n8n, não direto em `$json`.

### 3.3 Ativar o Workflow

1. Copie a **URL de produção** do webhook (deve ser `/webhook/` e **não** `/webhook-test/`).
2. Cole no `.env` do servidor como `WEBHOOK_URL_N8N`.
3. **Ative o workflow** no n8n (toggle no canto superior direito).
4. Reinicie o gateway: `systemctl restart wa-gateway`

### 3.4 Testar o Fluxo Completo

1. Envie uma mensagem do celular para o número WhatsApp Business.
2. Verifique o log do servidor: `journalctl -u wa-gateway -f`
3. Verifique a execução no n8n.
4. A resposta deve chegar no celular.

---

## Fase 4: Verificação do Negócio (Recomendado)

Para aumentar limites de mensagens e obter o selo de verificação:

1. No Business Manager, vá em **Configurações → Central de Segurança**.
2. Clique em **Iniciar Verificação**.
3. Envie documentos da empresa (CNPJ, contrato social, etc.).
4. Aguarde aprovação (24-48h em geral).

Após verificação, seus limites sobem de 250 para até 100.000 mensagens por dia.

---

## Checklist Final

- [ ] Droplet criado com Reserved IP
- [ ] DNS apontando para o Reserved IP
- [ ] Nginx configurado como proxy reverso
- [ ] Certificado SSL ativo (HTTPS)
- [ ] Bun instalado e projeto clonado
- [ ] `.env` preenchido com valores reais
- [ ] Serviço systemd ativo e rodando
- [ ] App criado no Meta Developers
- [ ] Número registrado e com status "Conectado"
- [ ] System User criado com token permanente
- [ ] Webhook configurado e verificado
- [ ] Campo `messages` assinado
- [ ] WABA inscrita via `subscribed_apps`
- [ ] Política de Privacidade e Termos configurados
- [ ] App em modo "Ao vivo"
- [ ] Workflow n8n ativo com URL de produção
- [ ] Teste completo: enviar mensagem → receber resposta

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'wa-omni-gateway API',
    version: '2.0.0',
    description: `Gateway multi-tenant para WhatsApp Business API.

Recebe webhooks da Meta, roteia para o bot/worker correto baseado no \`phone_number_id\`, e centraliza o envio de mensagens via \`/api/send\`.

## Autenticação

Todas as rotas \`/api/*\` exigem o header:
\`\`\`
Authorization: Bearer <GATEWAY_API_KEY>
\`\`\`

## Fluxo
\`\`\`
Celular → Meta → Gateway (roteia) → Bot/n8n → Gateway (/api/send) → Meta → Celular
\`\`\``,
    contact: {
      name: 'HaruCode',
      url: 'https://harucode.com.br',
      email: 'contato@harucode.com.br',
    },
  },
  servers: [
    {
      url: 'https://gateway.harucode.com.br',
      description: 'Produção (DigitalOcean)',
    },
    {
      url: 'http://localhost:3000',
      description: 'Desenvolvimento local',
    },
  ],
  tags: [
    { name: 'Clients', description: 'Gerenciamento de clientes (multi-tenant)' },
    { name: 'Messaging', description: 'Envio de mensagens via Meta API' },
    { name: 'Webhook', description: 'Recepção de webhooks da Meta' },
    { name: 'System', description: 'Rotas de sistema e monitoramento' },
  ],
  paths: {
    '/api/clients': {
      get: {
        tags: ['Clients'],
        summary: 'Listar clientes',
        description: 'Retorna todos os clientes cadastrados (ativos e inativos).',
        operationId: 'listClients',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Lista de clientes',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    count: { type: 'integer', example: 2 },
                    clients: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Client' },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
      post: {
        tags: ['Clients'],
        summary: 'Cadastrar novo cliente',
        description: `Cadastra um novo cliente no gateway. Cada cliente representa um número do WhatsApp Business com seu próprio destino (webhook) e token Meta.

Após o cadastro, o gateway roteia automaticamente as mensagens recebidas nesse \`phone_number_id\` para o \`webhook_url\` configurado.`,
        operationId: 'createClient',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateClient' },
              examples: {
                'bot-n8n': {
                  summary: 'Bot com n8n',
                  value: {
                    name: 'HaruCode Bot',
                    phone_number_id: '968853216316915',
                    webhook_url: 'https://n8n.harucode.com.br/webhook/cc05260a-f685-4a52-a2bf-6f7f402914d0',
                    meta_token: 'EAAMngw...',
                  },
                },
                'ghl-client': {
                  summary: 'Cliente GHL/LeadConnector',
                  value: {
                    name: 'Cliente X - GHL',
                    phone_number_id: '123456789012345',
                    webhook_url: 'https://services.leadconnectorhq.com/webhooks/inbound/...',
                    auth_token: 'token-do-ghl',
                    meta_token: 'EAABbb...',
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Cliente criado com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Cliente criado com sucesso' },
                    client: { $ref: '#/components/schemas/Client' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '409': {
            description: 'phone_number_id já cadastrado',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string', example: 'Já existe um cliente com phone_number_id: 968853216316915 (HaruCode Bot)' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/clients/{id}': {
      put: {
        tags: ['Clients'],
        summary: 'Atualizar cliente',
        description: 'Atualiza os dados de um cliente existente. Envie apenas os campos que deseja alterar.',
        operationId: 'updateClient',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID do cliente (UUID)',
            example: 'f1beb66b-3030-40cf-9d63-76a70a7079b7',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateClient' },
              examples: {
                'trocar-webhook': {
                  summary: 'Trocar URL do webhook',
                  value: { webhook_url: 'https://n8n.harucode.com.br/webhook/novo-id' },
                },
                'trocar-token': {
                  summary: 'Renovar token Meta',
                  value: { meta_token: 'EAANovo...' },
                },
                'desativar': {
                  summary: 'Desativar cliente',
                  value: { active: 0 },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Cliente atualizado',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Cliente atualizado' },
                    client: { $ref: '#/components/schemas/Client' },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Clients'],
        summary: 'Desativar cliente',
        description: 'Soft delete — marca o cliente como inativo. Mensagens para esse phone_number_id não serão mais roteadas.',
        operationId: 'deleteClient',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID do cliente (UUID)',
          },
        ],
        responses: {
          '200': {
            description: 'Cliente desativado',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Cliente "HaruCode Bot" desativado com sucesso' },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/send': {
      post: {
        tags: ['Messaging'],
        summary: 'Enviar mensagem',
        description: `Envia uma mensagem via WhatsApp Business API. O gateway resolve automaticamente o \`meta_token\` do cliente dono do \`phone_number_id\`.

Suporta os tipos: **text**, **template**, **image**, **document**, **audio**, **video**.

Este endpoint é chamado pelo bot/n8n para responder ao cliente final.`,
        operationId: 'sendMessage',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SendMessage' },
              examples: {
                'texto-simples': {
                  summary: 'Texto simples',
                  value: {
                    phone_number_id: '968853216316915',
                    to: '556799587200',
                    type: 'text',
                    text: { body: 'Olá! Como posso ajudar?' },
                  },
                },
                'template': {
                  summary: 'Template de mensagem',
                  value: {
                    phone_number_id: '968853216316915',
                    to: '556799587200',
                    type: 'template',
                    template: {
                      name: 'boas_vindas_harucode',
                      language: { code: 'en' },
                      components: [
                        {
                          type: 'body',
                          parameters: [{ type: 'text', text: 'João' }],
                        },
                      ],
                    },
                  },
                },
                'imagem': {
                  summary: 'Imagem com legenda',
                  value: {
                    phone_number_id: '968853216316915',
                    to: '556799587200',
                    type: 'image',
                    image: {
                      link: 'https://example.com/foto.jpg',
                      caption: 'Confira nossa promoção!',
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Mensagem enviada com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Mensagem enviada com sucesso' },
                    data: {
                      type: 'object',
                      properties: {
                        messaging_product: { type: 'string', example: 'whatsapp' },
                        contacts: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              input: { type: 'string', example: '556799587200' },
                              wa_id: { type: 'string', example: '556799587200' },
                            },
                          },
                        },
                        messages: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', example: 'wamid.HBgMNTU2Nzk5NTg3MjAw...' },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '422': {
            description: 'Erro ao enviar via Meta API',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string', example: 'Message failed to send because...' },
                    data: { type: 'object' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/webhook': {
      get: {
        tags: ['Webhook'],
        summary: 'Verificação do webhook (Meta challenge)',
        description: 'Endpoint de verificação chamado pela Meta ao configurar o webhook. Valida o `hub.verify_token` e retorna o `hub.challenge`.',
        operationId: 'verifyWebhook',
        parameters: [
          { name: 'hub.mode', in: 'query', required: true, schema: { type: 'string', enum: ['subscribe'] } },
          { name: 'hub.verify_token', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'hub.challenge', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Challenge aceito — retorna o valor do hub.challenge' },
          '403': { description: 'Token de verificação inválido' },
        },
      },
      post: {
        tags: ['Webhook'],
        summary: 'Recepção de eventos (Meta webhook)',
        description: `Recebe eventos do WhatsApp Cloud API. Valida a assinatura HMAC SHA-256 (\`x-hub-signature-256\`) e roteia a mensagem para o cliente correto baseado no \`phone_number_id\`.

**Não chame este endpoint diretamente** — ele é chamado pela Meta automaticamente.`,
        operationId: 'handleWebhook',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  object: { type: 'string', example: 'whatsapp_business_account' },
                  entry: { type: 'array', items: { type: 'object' } },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'EVENT_RECEIVED' },
          '401': { description: 'Assinatura HMAC inválida' },
        },
      },
    },
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        description: 'Verifica se o gateway está rodando.',
        operationId: 'healthCheck',
        responses: {
          '200': {
            description: 'Gateway ativo',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    uptime: { type: 'number', example: 12345.67 },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/privacy': {
      get: {
        tags: ['System'],
        summary: 'Política de Privacidade',
        description: 'Página HTML com a Política de Privacidade (LGPD).',
        operationId: 'privacyPolicy',
        responses: {
          '200': { description: 'HTML da Política de Privacidade' },
        },
      },
    },
    '/terms': {
      get: {
        tags: ['System'],
        summary: 'Termos de Uso',
        description: 'Página HTML com os Termos de Uso.',
        operationId: 'termsOfUse',
        responses: {
          '200': { description: 'HTML dos Termos de Uso' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'GATEWAY_API_KEY — chave de acesso à API de gerenciamento',
      },
    },
    schemas: {
      Client: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: 'f1beb66b-3030-40cf-9d63-76a70a7079b7' },
          name: { type: 'string', example: 'HaruCode Bot' },
          phone_number_id: { type: 'string', example: '968853216316915' },
          webhook_url: { type: 'string', format: 'uri', example: 'https://n8n.harucode.com.br/webhook/cc05260a' },
          auth_token: { type: 'string', nullable: true, example: null },
          meta_token: { type: 'string', example: 'EAAMngw...' },
          active: { type: 'integer', enum: [0, 1], example: 1 },
          created_at: { type: 'string', format: 'date-time', example: '2026-03-04 20:30:39' },
          updated_at: { type: 'string', format: 'date-time', example: '2026-03-04 20:30:39' },
        },
      },
      CreateClient: {
        type: 'object',
        required: ['name', 'phone_number_id', 'webhook_url', 'meta_token'],
        properties: {
          name: { type: 'string', description: 'Nome do cliente', example: 'HaruCode Bot' },
          phone_number_id: { type: 'string', description: 'ID do número no Meta', example: '968853216316915' },
          webhook_url: { type: 'string', format: 'uri', description: 'URL destino para encaminhar mensagens', example: 'https://n8n.harucode.com.br/webhook/cc05260a' },
          auth_token: { type: 'string', description: 'Token de autenticação para o destino (opcional)', example: 'token-secreto' },
          meta_token: { type: 'string', description: 'Token da Meta para envio de mensagens', example: 'EAAMngw...' },
        },
      },
      UpdateClient: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          phone_number_id: { type: 'string' },
          webhook_url: { type: 'string', format: 'uri' },
          auth_token: { type: 'string' },
          meta_token: { type: 'string' },
          active: { type: 'integer', enum: [0, 1] },
        },
      },
      SendMessage: {
        type: 'object',
        required: ['phone_number_id', 'to'],
        properties: {
          phone_number_id: { type: 'string', description: 'ID do número remetente (deve estar cadastrado)', example: '968853216316915' },
          to: { type: 'string', description: 'Número do destinatário (formato wa_id)', example: '556799587200' },
          type: { type: 'string', enum: ['text', 'template', 'image', 'document', 'audio', 'video'], default: 'text' },
          text: {
            type: 'object',
            properties: {
              body: { type: 'string', example: 'Olá! Como posso ajudar?' },
            },
          },
          template: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'boas_vindas_harucode' },
              language: {
                type: 'object',
                properties: {
                  code: { type: 'string', example: 'en' },
                },
              },
              components: { type: 'array', items: { type: 'object' } },
            },
          },
          image: {
            type: 'object',
            properties: {
              link: { type: 'string', format: 'uri' },
              id: { type: 'string' },
              caption: { type: 'string' },
            },
          },
          document: {
            type: 'object',
            properties: {
              link: { type: 'string', format: 'uri' },
              id: { type: 'string' },
              caption: { type: 'string' },
              filename: { type: 'string' },
            },
          },
          audio: {
            type: 'object',
            properties: {
              link: { type: 'string', format: 'uri' },
              id: { type: 'string' },
            },
          },
          video: {
            type: 'object',
            properties: {
              link: { type: 'string', format: 'uri' },
              id: { type: 'string' },
              caption: { type: 'string' },
            },
          },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: 'API key inválida ou ausente',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: { type: 'string', example: 'Unauthorized' },
                message: { type: 'string', example: 'API key inválida ou ausente. Use: Authorization: Bearer <GATEWAY_API_KEY>' },
              },
            },
          },
        },
      },
      BadRequest: {
        description: 'Requisição inválida',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: { type: 'string' },
                details: { type: 'string' },
              },
            },
          },
        },
      },
      NotFound: {
        description: 'Recurso não encontrado',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: { type: 'string', example: 'Cliente não encontrado' },
              },
            },
          },
        },
      },
    },
  },
};

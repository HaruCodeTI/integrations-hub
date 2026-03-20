import { test, expect, describe, beforeAll, mock } from 'bun:test';
import { DatabaseService } from '../../services/db.service';

const inMemoryDb = new DatabaseService(':memory:');
const mockCampaignsService = {
  parseCSV: mock(() => ({ rows: [{ telefone: '5541900000001', nome: 'Alice' }], columns: ['telefone', 'nome'] })),
  parseXLSX: mock(() => ({ rows: [], columns: [] })),
  createCampaign: mock(async (params: any) => ({ id: 'mock-uuid-1', name: params.name, status: 'running', phone_number_id: params.phone_number_id })),
  applyMapping: mock(() => []),
  getTierLimit: mock(() => 1000),
};

let CampaignsController: typeof import('./campaigns.controller').CampaignsController;

beforeAll(async () => {
  mock.module('../../services/db.service', () => ({ db: inMemoryDb, DatabaseService }));
  mock.module('./campaigns.service', () => ({ CampaignsService: mockCampaignsService }));
  const mod = await import('./campaigns.controller');
  CampaignsController = mod.CampaignsController;
});

describe('CampaignsController.listCampaigns', () => {
  test('retorna 200 com lista de campanhas', () => {
    const url = new URL('http://localhost/api/v2/campaigns');
    const res = CampaignsController.listCampaigns(url);
    expect(res.status).toBe(200);
  });

  test('retorna 200 com filtro de status', () => {
    const url = new URL('http://localhost/api/v2/campaigns?status=running');
    const res = CampaignsController.listCampaigns(url);
    expect(res.status).toBe(200);
  });
});

describe('CampaignsController.getCampaign', () => {
  test('retorna 404 para campanha inexistente', () => {
    const res = CampaignsController.getCampaign('nonexistent-uuid');
    expect(res.status).toBe(404);
  });

  test('retorna 200 para campanha existente', async () => {
    const campaign = inMemoryDb.createCampaign({
      name: 'Test',
      phone_number_id: 'phone-1',
      template_name: 'hello',
      template_language: 'pt_BR',
      variable_mapping: [],
      total_contacts: 0,
    });
    const res = CampaignsController.getCampaign(campaign.id);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(campaign.id);
  });
});

describe('CampaignsController.pauseCampaign', () => {
  test('retorna 404 para campanha inexistente', () => {
    const res = CampaignsController.pauseCampaign('nonexistent-uuid');
    expect(res.status).toBe(404);
  });

  test('retorna 200 e pausa campanha existente', async () => {
    const campaign = inMemoryDb.createCampaign({
      name: 'Pause Test',
      phone_number_id: 'phone-2',
      template_name: 'hello',
      template_language: 'pt_BR',
      variable_mapping: [],
      total_contacts: 0,
    });
    const res = CampaignsController.pauseCampaign(campaign.id);
    expect(res.status).toBe(200);
    const updated = inMemoryDb.getCampaign(campaign.id);
    expect(updated?.status).toBe('paused');
  });
});

describe('CampaignsController.resumeCampaign', () => {
  test('retorna 404 para campanha inexistente', () => {
    const res = CampaignsController.resumeCampaign('nonexistent-uuid');
    expect(res.status).toBe(404);
  });
});

describe('CampaignsController.cancelCampaign', () => {
  test('retorna 404 para campanha inexistente', () => {
    const res = CampaignsController.cancelCampaign('nonexistent-uuid');
    expect(res.status).toBe(404);
  });
});

describe('CampaignsController.listContacts', () => {
  test('retorna 404 para campanha inexistente', () => {
    const url = new URL('http://localhost/api/v2/campaigns/nonexistent/contacts');
    const res = CampaignsController.listContacts('nonexistent', url);
    expect(res.status).toBe(404);
  });

  test('retorna 200 com lista de contatos', () => {
    const campaign = inMemoryDb.createCampaign({
      name: 'ContactsTest',
      phone_number_id: 'phone-contacts',
      template_name: 'hello',
      template_language: 'pt_BR',
      variable_mapping: [],
      total_contacts: 0,
    });
    const url = new URL(`http://localhost/api/v2/campaigns/${campaign.id}/contacts`);
    const res = CampaignsController.listContacts(campaign.id, url);
    expect(res.status).toBe(200);
  });
});

describe('CampaignsController.createCampaign', () => {
  test('retorna 400 se meta ausente no multipart', async () => {
    const formData = new FormData();
    const req = new Request('http://localhost/api/v2/campaigns', {
      method: 'POST',
      body: formData,
    });
    const res = await CampaignsController.createCampaign(req);
    expect(res.status).toBe(400);
  });

  test('retorna 400 se campos obrigatórios ausentes no JSON', async () => {
    const req = new Request('http://localhost/api/v2/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test',
        // missing phone_number_id, template_name, template_language
        contacts: [{ phone: '5541900000001', variables: {} }],
      }),
    });
    const res = await CampaignsController.createCampaign(req);
    expect(res.status).toBe(400);
  });

  test('retorna 400 se contacts vazio no JSON', async () => {
    const req = new Request('http://localhost/api/v2/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test',
        phone_number_id: 'phone-1',
        template_name: 'hello_world',
        template_language: 'pt_BR',
        contacts: [],
      }),
    });
    const res = await CampaignsController.createCampaign(req);
    expect(res.status).toBe(400);
  });

  test('retorna 201 com JSON body valido', async () => {
    const req = new Request('http://localhost/api/v2/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test',
        phone_number_id: 'phone-1',
        template_name: 'hello_world',
        template_language: 'pt_BR',
        variable_mapping: [],
        delay_seconds: 5,
        contacts: [{ phone: '5541900000001', variables: {} }],
      }),
    });
    const res = await CampaignsController.createCampaign(req);
    expect(res.status).toBe(201);
  });
});

describe('CampaignsController.parseFile', () => {
  test('retorna 400 se sem arquivo', async () => {
    const formData = new FormData();
    const req = new Request('http://localhost/api/v2/campaigns/parse', {
      method: 'POST',
      body: formData,
    });
    const res = await CampaignsController.parseFile(req);
    expect(res.status).toBe(400);
  });

  test('retorna 400 para formato não suportado', async () => {
    const formData = new FormData();
    formData.append('file', new File(['test'], 'test.txt', { type: 'text/plain' }));
    const req = new Request('http://localhost/api/v2/campaigns/parse', {
      method: 'POST',
      body: formData,
    });
    const res = await CampaignsController.parseFile(req);
    expect(res.status).toBe(400);
  });

  test('retorna 200 para CSV válido', async () => {
    const csvContent = 'telefone,nome\n5541900000001,Alice';
    const formData = new FormData();
    formData.append('file', new File([csvContent], 'contatos.csv', { type: 'text/csv' }));
    const req = new Request('http://localhost/api/v2/campaigns/parse', {
      method: 'POST',
      body: formData,
    });
    const res = await CampaignsController.parseFile(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.columns).toBeDefined();
    expect(data.total).toBeDefined();
    expect(data.preview).toBeDefined();
  });
});

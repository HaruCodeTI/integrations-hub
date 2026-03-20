import { test, expect, describe, beforeAll, mock } from 'bun:test';
import { DatabaseService } from '../../services/db.service';

// In-memory DB to avoid mock.module leak (Bun v1.3.10 bug)
const inMemoryDb = new DatabaseService(':memory:');

let CampaignsService: typeof import('./campaigns.service').CampaignsService;

beforeAll(async () => {
  mock.module('../../services/db.service', () => ({ db: inMemoryDb, DatabaseService }));
  const mod = await import('./campaigns.service');
  CampaignsService = mod.CampaignsService;
});

describe('CampaignsService.parseCSV', () => {
  test('parses CSV simples com coluna telefone', () => {
    const csv = 'telefone,nome\n5541900000001,Alice\n5541900000002,Bob';
    const result = CampaignsService.parseCSV(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.columns).toContain('telefone');
    expect(result.rows[0].telefone).toBe('5541900000001');
  });

  test('retorna erro se coluna telefone ausente', () => {
    const csv = 'nome,email\nAlice,a@b.com';
    const result = CampaignsService.parseCSV(csv);
    expect(result.error).toMatch(/telefone/i);
  });

  test('remove duplicatas por telefone', () => {
    const csv = 'telefone\n5541900000001\n5541900000001\n5541900000002';
    const result = CampaignsService.parseCSV(csv);
    expect(result.rows).toHaveLength(2);
  });

  test('remove linhas com telefone vazio', () => {
    const csv = 'telefone,nome\n,Alice\n5541900000001,Bob\n  ,Carol';
    const result = CampaignsService.parseCSV(csv);
    expect(result.rows).toHaveLength(1);
  });

  test('limita a 10000 contatos', () => {
    const lines = ['telefone'];
    for (let i = 0; i < 10005; i++) lines.push(`554190000${String(i).padStart(4, '0')}`);
    const result = CampaignsService.parseCSV(lines.join('\n'));
    expect(result.rows).toHaveLength(10000);
  });
});

describe('CampaignsService.applyMapping', () => {
  test('mapeia variaveis corretamente', () => {
    const variables = { nome: 'Alice', produto: 'Widget' };
    const mapping = ['nome', 'produto'];
    const result = CampaignsService.applyMapping(variables, mapping);
    expect(result).toEqual([
      { type: 'text', text: 'Alice' },
      { type: 'text', text: 'Widget' },
    ]);
  });

  test('retorna string vazia para coluna inexistente', () => {
    const variables = { nome: 'Alice' };
    const mapping = ['nome', 'email'];
    const result = CampaignsService.applyMapping(variables, mapping);
    expect(result[1].text).toBe('');
  });
});

describe('CampaignsService.getTierLimit', () => {
  test('tier 1 = 1000', () => expect(CampaignsService.getTierLimit(1)).toBe(1000));
  test('tier 2 = 10000', () => expect(CampaignsService.getTierLimit(2)).toBe(10000));
  test('tier 3 = 100000', () => expect(CampaignsService.getTierLimit(3)).toBe(100000));
  test('tier desconhecido = 1000', () => expect(CampaignsService.getTierLimit(99)).toBe(1000));
});

describe('CampaignsService.createCampaign', () => {
  test('cria campanha com status running quando sem scheduled_at', async () => {
    const campaign = await CampaignsService.createCampaign({
      name: 'Test Campaign',
      phone_number_id: 'phone-123',
      template_name: 'hello_world',
      template_language: 'pt_BR',
      variable_mapping: ['nome'],
      delay_seconds: 5,
      contacts: [{ phone: '5541900000001', variables: { nome: 'Alice' } }],
    });
    expect(campaign.status).toBe('running');
    expect(campaign.name).toBe('Test Campaign');
  });

  test('cria campanha com status pending quando tem scheduled_at', async () => {
    const campaign = await CampaignsService.createCampaign({
      name: 'Scheduled Campaign',
      phone_number_id: 'phone-123',
      template_name: 'hello_world',
      template_language: 'pt_BR',
      variable_mapping: [],
      delay_seconds: 5,
      contacts: [{ phone: '5541900000002', variables: {} }],
      scheduled_at: '2026-12-01T10:00:00.000Z',
    });
    expect(campaign.status).toBe('pending');
  });

  test('cria jobs para todos os contatos (mais de 50)', async () => {
    const contacts = Array.from({ length: 55 }, (_, i) => ({
      phone: `554190000${String(i).padStart(4, '0')}`,
      variables: {},
    }));
    const campaign = await CampaignsService.createCampaign({
      name: 'Large Campaign',
      phone_number_id: 'phone-456',
      template_name: 'hello_world',
      template_language: 'pt_BR',
      variable_mapping: [],
      delay_seconds: 5,
      contacts,
    });
    // Verify all 55 contacts have jobs
    const jobCount = inMemoryDb.countActiveJobs(campaign.id);
    expect(jobCount).toBe(55);
  });
});

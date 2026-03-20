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

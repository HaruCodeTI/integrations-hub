import { test, expect, describe, beforeAll, mock } from 'bun:test';
import { DatabaseService } from '../../services/db.service';

// Cria DB in-memory próprio para evitar vazamento de mocks de outros arquivos de teste
// (workaround para bug Bun v1.3.10 onde mock.module não é restaurado entre arquivos)
const inMemoryDb = new DatabaseService(':memory:');

let ConversationsService: typeof import('./conversations.service').ConversationsService;

const phoneId = 'conv-test-phone';
const contact1 = '5541900000010';
const contact2 = '5541900000011';

beforeAll(async () => {
  // Injeta o DB in-memory ANTES de importar o serviço
  mock.module('../../services/db.service', () => ({ db: inMemoryDb, DatabaseService }));
  const mod = await import('./conversations.service');
  ConversationsService = mod.ConversationsService;

  // Popula mensagens para teste
  inMemoryDb.saveMessage({ id: 'c-msg-1', phone_number_id: phoneId, contact_phone: contact1, direction: 'inbound', type: 'text', content: { text: { body: 'Ola' } } });
  inMemoryDb.saveMessage({ id: 'c-msg-2', phone_number_id: phoneId, contact_phone: contact1, direction: 'outbound', type: 'text', content: { text: { body: 'Tudo bem?' } } });
  inMemoryDb.saveMessage({ id: 'c-msg-3', phone_number_id: phoneId, contact_phone: contact2, direction: 'inbound', type: 'text', content: { text: { body: 'Oi' } } });
});

describe('ConversationsService', () => {
  test('listConversations retorna contatos unicos com ultima mensagem', () => {
    const convs = ConversationsService.listConversations(phoneId);
    expect(convs.length).toBeGreaterThanOrEqual(2);
    const phones = convs.map(c => c.contact_phone);
    expect(phones).toContain(contact1);
    expect(phones).toContain(contact2);
  });

  test('getMessages retorna historico em ordem ASC', () => {
    const msgs = ConversationsService.getMessages(phoneId, contact1);
    expect(msgs.length).toBe(2);
    expect(msgs[0].id).toBe('c-msg-1');
    expect(msgs[1].direction).toBe('outbound');
  });

  test('getMessages retorna array vazio para contato inexistente', () => {
    const msgs = ConversationsService.getMessages(phoneId, '5541000000000');
    expect(msgs).toHaveLength(0);
  });
});

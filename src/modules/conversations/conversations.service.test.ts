import { test, expect, describe, beforeAll } from 'bun:test';
import { ConversationsService } from './conversations.service';
import { db } from '../../services/db.service';

describe('ConversationsService', () => {
  const phoneId = 'conv-test-phone';
  const contact1 = '5541900000010';
  const contact2 = '5541900000011';

  beforeAll(() => {
    // Popula messages para teste
    db.saveMessage({ id: 'c-msg-1', phone_number_id: phoneId, contact_phone: contact1, direction: 'inbound', type: 'text', content: { text: { body: 'Ola' } } });
    db.saveMessage({ id: 'c-msg-2', phone_number_id: phoneId, contact_phone: contact1, direction: 'outbound', type: 'text', content: { text: { body: 'Tudo bem?' } } });
    db.saveMessage({ id: 'c-msg-3', phone_number_id: phoneId, contact_phone: contact2, direction: 'inbound', type: 'text', content: { text: { body: 'Oi' } } });
  });

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

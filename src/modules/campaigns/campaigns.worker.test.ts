import { test, expect, describe, beforeAll, mock, afterAll } from 'bun:test';
import { DatabaseService } from '../../services/db.service';

const inMemoryDb = new DatabaseService(':memory:');

// Mock sender.service
const mockSender = {
  send: mock(() => Promise.resolve({ success: true, data: { messages: [{ id: 'wamid.test123' }] } })),
};

let startCampaignWorker: typeof import('./campaigns.worker').startCampaignWorker;
let processNextJob: typeof import('./campaigns.worker').processNextJob;

beforeAll(async () => {
  mock.module('../../services/db.service', () => ({ db: inMemoryDb, DatabaseService }));
  mock.module('../../services/sender.service', () => ({ sender: mockSender }));
  const mod = await import('./campaigns.worker');
  startCampaignWorker = mod.startCampaignWorker;
  processNextJob = mod.processNextJob;
});

describe('processNextJob', () => {
  test('nao processa nada se sem jobs', async () => {
    const result = await processNextJob();
    expect(result).toBe(false);
  });

  test('processa job e marca como sent', async () => {
    // Reset mock to ensure success
    mockSender.send.mockImplementation(() => Promise.resolve({ success: true, data: { messages: [{ id: 'wamid.test123' }] } }));

    // Create campaign with contacts
    const campaign = inMemoryDb.createCampaign({
      name: 'Worker Test',
      phone_number_id: 'phone-worker',
      template_name: 'hello_world',
      template_language: 'pt_BR',
      variable_mapping: [],
      delay_seconds: 0,
      total_contacts: 1,
    });
    inMemoryDb.insertCampaignContacts(campaign.id, [
      { phone: '5541900000099', variables: {} },
    ]);
    const contacts = inMemoryDb.listCampaignContacts(campaign.id, undefined, 1, 100);
    inMemoryDb.insertCampaignJobs(campaign.id, contacts.map(c => c.id));

    const result = await processNextJob();
    expect(result).toBe(true);
    expect(mockSender.send).toHaveBeenCalled();
  });

  test('incrementa tentativas e agenda retry no erro', async () => {
    // Reset mock to simulate failure
    mockSender.send.mockImplementation(() => Promise.resolve({ success: false, error: 'rate limit' }));

    const campaign = inMemoryDb.createCampaign({
      name: 'Retry Test',
      phone_number_id: 'phone-retry',
      template_name: 'hello_world',
      template_language: 'pt_BR',
      variable_mapping: [],
      delay_seconds: 0,
      total_contacts: 1,
    });
    inMemoryDb.insertCampaignContacts(campaign.id, [
      { phone: '5541900000098', variables: {} },
    ]);
    const contacts = inMemoryDb.listCampaignContacts(campaign.id, undefined, 1, 100);
    inMemoryDb.insertCampaignJobs(campaign.id, contacts.map(c => c.id));

    const beforeMs = Date.now();
    const result = await processNextJob();
    expect(result).toBe(true);

    // Verify the job was requeued: attempts incremented and next_attempt_at set ~60s ahead
    const jobs = (inMemoryDb as any).db.query(
      `SELECT * FROM campaign_jobs WHERE campaign_id = ? ORDER BY id DESC LIMIT 1`
    ).get(campaign.id) as { attempts: number; next_attempt_at: string; status: string };

    expect(jobs).toBeDefined();
    expect(jobs.attempts).toBe(1);
    expect(jobs.status).toBe('queued');

    const nextAttemptMs = new Date(jobs.next_attempt_at + 'Z').getTime();
    // next_attempt_at should be at least 55s in the future (60s delay, allow 5s tolerance)
    expect(nextAttemptMs).toBeGreaterThan(beforeMs + 55_000);
  });
});

describe('startCampaignWorker', () => {
  test('retorna funcao de cleanup (clearInterval)', () => {
    const cleanup = startCampaignWorker();
    expect(typeof cleanup).toBe('function');
    cleanup(); // Should not throw
  });
});

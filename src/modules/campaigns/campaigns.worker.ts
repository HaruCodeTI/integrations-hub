import { db } from '../../services/db.service';
import { sender } from '../../services/sender.service';
import { CampaignsService } from './campaigns.service';

const RETRY_DELAYS = [60, 300]; // seconds — first retry after 60s, second after 300s

export async function processNextJob(): Promise<boolean> {
  // Get one queued job across all running campaigns
  const jobs = db.getNextQueuedJobs(1);
  if (!jobs || jobs.length === 0) return false;

  const job = jobs[0];

  // Get the campaign
  const campaign = db.getCampaign(job.campaign_id);
  if (!campaign || campaign.status === 'paused' || campaign.status === 'cancelled') {
    db.markJobFailed(job.id, job.contact_id, undefined, 'Campaign not active');
    return true;
  }

  // Get the contact
  const contact = db.getCampaignContact(job.contact_id);
  if (!contact) {
    db.markJobFailed(job.id, job.contact_id, undefined, 'Contact not found');
    return true;
  }

  // Check tier rate limit (daily limit)
  const tierLimit = CampaignsService.getTierLimit(campaign.meta_tier ?? 1);
  const sentToday = db.countSentToday(campaign.phone_number_id);
  if (sentToday >= tierLimit) {
    // Re-queue job for later without counting as attempt
    db.requeueJob(job.id, 300);
    return false;
  }

  // Build template parameters
  const variables = typeof contact.variables === 'string'
    ? JSON.parse(contact.variables)
    : contact.variables as Record<string, string>;

  const mapping = typeof campaign.variable_mapping === 'string'
    ? JSON.parse(campaign.variable_mapping)
    : campaign.variable_mapping as string[];

  const parameters = CampaignsService.applyMapping(variables, mapping);

  try {
    const result = await sender.send({
      phone_number_id: campaign.phone_number_id,
      to: contact.phone,
      type: 'template',
      template: {
        name: campaign.template_name,
        language: { code: campaign.template_language },
        ...(parameters.length > 0 ? {
          components: [{
            type: 'body',
            parameters,
          }],
        } : {}),
      },
    });

    if (result.success && result.data?.messages?.[0]?.id) {
      const wamid = result.data.messages[0].id as string;
      db.markJobDone(job.id, job.contact_id, wamid);
    } else {
      await handleJobFailure(job, result.error ?? 'Unknown error');
    }
  } catch (err) {
    await handleJobFailure(job, String(err));
  }

  // Respect delay between messages
  if (campaign.delay_seconds > 0) {
    await Bun.sleep(campaign.delay_seconds * 1000);
  }

  return true;
}

async function handleJobFailure(
  job: { id: number; attempts: number; contact_id: number },
  error: string
): Promise<void> {
  const attempts = (job.attempts ?? 0) + 1;
  if (attempts > RETRY_DELAYS.length) {
    // Exceeded max retries — mark as failed
    db.markJobFailed(job.id, job.contact_id, undefined, error);
  } else {
    // Schedule retry
    const delay = RETRY_DELAYS[attempts - 1];
    db.requeueJob(job.id, delay);
  }
}

export function startCampaignWorker(): () => void {
  const interval = setInterval(async () => {
    try {
      await processNextJob();
    } catch (err) {
      console.error('[campaign-worker] Error:', err);
    }
  }, 5000);

  console.log('[campaign-worker] Started (polling every 5s)');
  return () => clearInterval(interval);
}

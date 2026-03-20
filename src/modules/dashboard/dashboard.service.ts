// src/modules/dashboard/dashboard.service.ts
import { db } from '../../services/db.service';

export interface DashboardMetrics {
  messages_sent_7d: number;
  delivery_rate: number;
  read_rate: number;
  active_campaigns: number;
  recent_campaigns: Array<{
    id: string;
    name: string;
    status: string;
    total_contacts: number;
    sent: number;
    delivered: number;
  }>;
}

export class DashboardService {
  static getMetrics(phone_number_id: string): DashboardMetrics {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { sent7d, delivered7d, read7d, activeCampaigns, recentCampaigns } =
      db.getDashboardMetrics(phone_number_id, since);

    const delivery_rate = sent7d > 0 ? Math.round((delivered7d / sent7d) * 100) : 0;
    const read_rate = sent7d > 0 ? Math.round((read7d / sent7d) * 100) : 0;

    return {
      messages_sent_7d: sent7d,
      delivery_rate,
      read_rate,
      active_campaigns: activeCampaigns,
      recent_campaigns: recentCampaigns,
    };
  }
}

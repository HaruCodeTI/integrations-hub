import * as XLSX from 'xlsx';
import { db, DatabaseService } from '../../services/db.service';
import type { Campaign } from '../../services/db.service';

export interface ParseResult {
  rows: Array<Record<string, string>>;
  columns: string[];
  error?: string;
}

export interface CreateCampaignParams {
  name: string;
  phone_number_id: string;
  template_name: string;
  template_language: string;
  variable_mapping: string[];
  delay_seconds: number;
  contacts: Array<{ phone: string; variables: Record<string, string> }>;
  scheduled_at?: string;
}

export class CampaignsService {
  static parseCSV(csv: string): ParseResult {
    const lines = csv.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) return { rows: [], columns: [], error: 'CSV vazio ou sem dados' };

    const columns = lines[0].split(',').map(c => c.trim());
    if (!columns.includes('telefone')) {
      return { rows: [], columns, error: 'Coluna "telefone" obrigatória não encontrada' };
    }

    const telIdx = columns.indexOf('telefone');
    const seen = new Set<string>();
    const rows: Array<Record<string, string>> = [];

    for (let i = 1; i < lines.length && rows.length < 10000; i++) {
      const parts = lines[i].split(',').map(p => p.trim());
      const phone = parts[telIdx] ?? '';
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      const row: Record<string, string> = {};
      for (let j = 0; j < columns.length; j++) {
        row[columns[j]] = parts[j] ?? '';
      }
      rows.push(row);
    }

    return { rows, columns };
  }

  static parseXLSX(buffer: ArrayBuffer): ParseResult {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    return CampaignsService.parseCSV(csv);
  }

  static applyMapping(
    variables: Record<string, string>,
    mapping: string[]
  ): Array<{ type: 'text'; text: string }> {
    return mapping.map(col => ({ type: 'text', text: variables[col] ?? '' }));
  }

  static async createCampaign(params: CreateCampaignParams): Promise<Campaign> {
    const status = params.scheduled_at ? 'pending' : 'running';
    const campaign = db.createCampaign({
      name: params.name,
      phone_number_id: params.phone_number_id,
      template_name: params.template_name,
      template_language: params.template_language,
      variable_mapping: params.variable_mapping,
      delay_seconds: params.delay_seconds,
      scheduled_at: params.scheduled_at,
      status,
      total_contacts: params.contacts.length,
    });
    db.insertCampaignContacts(campaign.id, params.contacts);
    const contactIds = db.listCampaignContacts(campaign.id).map(c => c.id);
    db.insertCampaignJobs(campaign.id, contactIds);
    return campaign;
  }

  static getTierLimit(tier: number): number {
    return ({ 1: 1000, 2: 10000, 3: 100000 } as Record<number, number>)[tier] ?? 1000;
  }
}

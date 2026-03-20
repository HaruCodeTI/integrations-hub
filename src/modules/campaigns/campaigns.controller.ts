import { db } from '../../services/db.service';
import { CampaignsService } from './campaigns.service';

export class CampaignsController {
  // GET /api/v2/campaigns?phone_number_id=xxx&page=1&status=running
  static listCampaigns(url: URL): Response {
    const status = url.searchParams.get('status') ?? undefined;
    const campaigns = db.listCampaigns(status);
    return Response.json(campaigns);
  }

  // POST /api/v2/campaigns — multipart/form-data with file + json fields
  static async createCampaign(req: Request): Promise<Response> {
    try {
      const contentType = req.headers.get('content-type') ?? '';
      let body: any;

      if (contentType.includes('multipart/form-data')) {
        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        const metaStr = formData.get('meta') as string | null;
        if (!metaStr) return Response.json({ error: 'Campo meta obrigatório' }, { status: 400 });
        try {
          body = JSON.parse(metaStr);
        } catch {
          return Response.json({ error: 'Campo meta deve ser JSON válido' }, { status: 400 });
        }

        if (file) {
          // Parse the file
          const buffer = await file.arrayBuffer();
          const filename = file.name.toLowerCase();
          let parseResult;
          if (filename.endsWith('.csv')) {
            const text = new TextDecoder().decode(buffer);
            parseResult = CampaignsService.parseCSV(text);
          } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
            parseResult = CampaignsService.parseXLSX(buffer);
          } else {
            return Response.json({ error: 'Formato de arquivo não suportado. Use CSV ou XLSX.' }, { status: 400 });
          }
          if (parseResult.error) return Response.json({ error: parseResult.error }, { status: 400 });
          // Map rows to contacts
          body.contacts = parseResult.rows.map(row => ({
            phone: row.telefone,
            variables: row,
          }));
        }
      } else {
        body = await req.json();
      }

      // Validate required fields
      const { name, phone_number_id, template_name, template_language, variable_mapping, delay_seconds, contacts, scheduled_at } = body;
      if (!name || !phone_number_id || !template_name || !template_language) {
        return Response.json({ error: 'Campos obrigatórios: name, phone_number_id, template_name, template_language' }, { status: 400 });
      }
      if (!Array.isArray(contacts) || contacts.length === 0) {
        return Response.json({ error: 'Lista de contatos obrigatória e não pode ser vazia' }, { status: 400 });
      }

      const campaign = await CampaignsService.createCampaign({
        name,
        phone_number_id,
        template_name,
        template_language,
        variable_mapping: variable_mapping ?? [],
        delay_seconds: delay_seconds ?? 5,
        contacts,
        scheduled_at,
      });
      return Response.json(campaign, { status: 201 });
    } catch (err) {
      console.error('[campaigns] createCampaign error:', err);
      return Response.json({ error: 'Erro interno' }, { status: 500 });
    }
  }

  // GET /api/v2/campaigns/:id
  static getCampaign(id: string): Response {
    const campaign = db.getCampaign(id);
    if (!campaign) return Response.json({ error: 'Campanha não encontrada' }, { status: 404 });
    return Response.json(campaign);
  }

  // POST /api/v2/campaigns/:id/pause
  static pauseCampaign(id: string): Response {
    const campaign = db.getCampaign(id);
    if (!campaign) return Response.json({ error: 'Campanha não encontrada' }, { status: 404 });
    db.updateCampaignStatus(id, 'paused');
    return Response.json({ ok: true });
  }

  // POST /api/v2/campaigns/:id/resume
  static resumeCampaign(id: string): Response {
    const campaign = db.getCampaign(id);
    if (!campaign) return Response.json({ error: 'Campanha não encontrada' }, { status: 404 });
    db.updateCampaignStatus(id, 'running');
    return Response.json({ ok: true });
  }

  // POST /api/v2/campaigns/:id/cancel
  static cancelCampaign(id: string): Response {
    const campaign = db.getCampaign(id);
    if (!campaign) return Response.json({ error: 'Campanha não encontrada' }, { status: 404 });
    db.updateCampaignStatus(id, 'cancelled');
    return Response.json({ ok: true });
  }

  // GET /api/v2/campaigns/:id/contacts?page=1
  static listContacts(id: string, url: URL): Response {
    const campaign = db.getCampaign(id);
    if (!campaign) return Response.json({ error: 'Campanha não encontrada' }, { status: 404 });
    const rawPage = parseInt(url.searchParams.get('page') ?? '1', 10);
    const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
    const contacts = db.listCampaignContacts(id, undefined, page, 50);
    return Response.json(contacts);
  }

  // POST /api/v2/campaigns/parse — parse file and return columns + preview
  static async parseFile(req: Request): Promise<Response> {
    try {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) return Response.json({ error: 'Arquivo obrigatório' }, { status: 400 });

      const buffer = await file.arrayBuffer();
      const filename = file.name.toLowerCase();
      let result;
      if (filename.endsWith('.csv')) {
        const text = new TextDecoder().decode(buffer);
        result = CampaignsService.parseCSV(text);
      } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
        result = CampaignsService.parseXLSX(buffer);
      } else {
        return Response.json({ error: 'Formato não suportado' }, { status: 400 });
      }
      if (result.error) return Response.json({ error: result.error }, { status: 400 });
      return Response.json({
        columns: result.columns,
        total: result.rows.length,
        preview: result.rows.slice(0, 5),
      });
    } catch (err) {
      console.error('[campaigns] parseFile error:', err);
      return Response.json({ error: 'Erro ao processar arquivo' }, { status: 500 });
    }
  }
}

import { CampaignsController } from './campaigns.controller';

export async function campaignsRoutes(req: Request, method: string, pathname: string): Promise<Response | null> {
  // POST /api/v2/campaigns/parse — MUST be before /:id routes
  if (method === 'POST' && pathname === '/api/v2/campaigns/parse') {
    return CampaignsController.parseFile(req);
  }

  // GET /api/v2/campaigns
  if (method === 'GET' && pathname === '/api/v2/campaigns') {
    return CampaignsController.listCampaigns(new URL(req.url));
  }

  // POST /api/v2/campaigns
  if (method === 'POST' && pathname === '/api/v2/campaigns') {
    return CampaignsController.createCampaign(req);
  }

  // Routes with :id (UUID format)
  const idMatch = pathname.match(/^\/api\/v2\/campaigns\/([^/]+)$/);
  if (idMatch) {
    if (method === 'GET') return CampaignsController.getCampaign(idMatch[1]);
  }

  const actionMatch = pathname.match(/^\/api\/v2\/campaigns\/([^/]+)\/(pause|resume|cancel|contacts)$/);
  if (actionMatch) {
    const [, id, action] = actionMatch;
    if (method === 'POST' && action === 'pause') return CampaignsController.pauseCampaign(id);
    if (method === 'POST' && action === 'resume') return CampaignsController.resumeCampaign(id);
    if (method === 'POST' && action === 'cancel') return CampaignsController.cancelCampaign(id);
    if (method === 'GET' && action === 'contacts') return CampaignsController.listContacts(id, new URL(req.url));
  }

  return null;
}

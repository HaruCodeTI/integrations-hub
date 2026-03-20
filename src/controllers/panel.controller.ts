// src/controllers/panel.controller.ts
import { db } from '../services/db.service';

export class PanelController {
  static listAccounts(): Response {
    const clients = db.getActiveClients();
    return Response.json(
      clients.map(c => ({
        id: c.id,
        name: c.name,
        phone_number_id: c.phone_number_id,
        client_type: c.client_type,
      }))
    );
  }
}

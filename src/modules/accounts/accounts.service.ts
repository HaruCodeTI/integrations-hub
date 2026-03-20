// src/modules/accounts/accounts.service.ts
import { db } from '../../services/db.service';
import type { Client, CreateClientInput, UpdateClientInput } from '../../services/db.service';

export class AccountsService {
  static list(): Client[] {
    return db.getAllClients();
  }

  static get(id: string): Client | null {
    return db.getClientById(id) ?? null;
  }

  static create(input: CreateClientInput): Client {
    return db.createClient(input);
  }

  static update(id: string, input: UpdateClientInput): Client | null {
    const existing = db.getClientById(id);
    if (!existing) return null;
    db.updateClient(id, input);
    return db.getClientById(id)!;
  }

  static delete(id: string): boolean {
    const existing = db.getClientById(id);
    if (!existing) return false;
    db.deleteClient(id);
    return true;
  }
}

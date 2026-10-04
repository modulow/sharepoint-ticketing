import type { ITicket, ITicketUpdate, IUserContext, IUserSummary } from '../models/Ticket';

export interface ITicketService {
  getUserContext(): Promise<IUserContext>;
  getTickets(context: IUserContext): Promise<ITicket[]>;
  getAssignableUsers(): Promise<IUserSummary[]>;
  updateTicket(id: number, update: ITicketUpdate): Promise<void>;
  getIntakeFormUrl(): string;
}

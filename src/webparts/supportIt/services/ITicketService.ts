import type { INewTicket, ITicket, ITicketUpdate, IUserContext, IUserSummary } from '../models/Ticket';

export interface ITicketService {
  getUserContext(): Promise<IUserContext>;
  getTickets(context: IUserContext): Promise<ITicket[]>;
  getAssignableUsers(): Promise<IUserSummary[]>;
  createTicket(ticket: INewTicket): Promise<ITicket>;
  updateTicket(id: number, update: ITicketUpdate): Promise<void>;
}

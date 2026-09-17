import type { INewTicket, ITicket, ITicketUpdate, IUserContext } from '../models/Ticket';

export interface ITicketService {
  getUserContext(): Promise<IUserContext>;
  getTickets(context: IUserContext): Promise<ITicket[]>;
  createTicket(ticket: INewTicket): Promise<ITicket>;
  updateTicket(id: number, update: ITicketUpdate): Promise<void>;
}

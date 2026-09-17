import type { ITicketService } from '../services/ITicketService';

export interface ISupportItProps {
  service: ITicketService;
  userDisplayName: string;
}

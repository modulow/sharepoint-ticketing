export const ticketCategories = ['Matériel', 'Logiciel', 'Accès', 'Réseau', 'Téléphonie', 'Autre'] as const;
export const ticketPriorities = ['Basse', 'Normale', 'Haute', 'Critique'] as const;
export const ticketStatuses = ['Nouveau', 'En cours', 'En attente', 'Résolu', 'Fermé'] as const;

export type TicketCategory = typeof ticketCategories[number];
export type TicketPriority = typeof ticketPriorities[number];
export type TicketStatus = typeof ticketStatuses[number];

export interface IUserSummary {
  id: number;
  displayName: string;
  email: string;
}

export interface ITicket {
  id: number;
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  assignedTo?: IUserSummary;
  dueDate?: string;
  resolution?: string;
  author: IUserSummary;
  created: string;
  modified: string;
  attachmentCount: number;
}

export interface INewTicket {
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
}

export interface ITicketUpdate {
  status: TicketStatus;
  priority: TicketPriority;
  dueDate?: string;
  resolution?: string;
}

export interface IUserContext {
  user: IUserSummary;
  isAgent: boolean;
}

export interface ITicketSummary {
  total: number;
  open: number;
  waiting: number;
  resolved: number;
  critical: number;
}

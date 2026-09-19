export const ticketCategories = ['Hardware', 'Software', 'Access', 'Network', 'Telephony', 'Other'] as const;
export const ticketPriorities = ['Low', 'Normal', 'High', 'Critical'] as const;
export const ticketStatuses = ['New', 'In progress', 'Waiting', 'Resolved', 'Closed'] as const;

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
  assignedToId?: number;
  clearAssignment?: boolean;
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

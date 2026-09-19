import type { ITicket, ITicketSummary } from '../models/Ticket';

export function summarizeTickets(tickets: ITicket[]): ITicketSummary {
  return tickets.reduce<ITicketSummary>((summary, ticket) => {
    summary.total += 1;
    if (ticket.status !== 'Resolved' && ticket.status !== 'Closed') {
      summary.open += 1;
    }
    if (ticket.status === 'Waiting') {
      summary.waiting += 1;
    }
    if (ticket.status === 'Resolved' || ticket.status === 'Closed') {
      summary.resolved += 1;
    }
    if (ticket.priority === 'Critical' && ticket.status !== 'Closed') {
      summary.critical += 1;
    }
    return summary;
  }, { total: 0, open: 0, waiting: 0, resolved: 0, critical: 0 });
}

export function formatDate(value?: string): string {
  if (!value) {
    return 'Not set';
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(value));
}

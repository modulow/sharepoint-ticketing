import type { ITicket, ITicketSummary } from '../models/Ticket';

export function summarizeTickets(tickets: ITicket[]): ITicketSummary {
  return tickets.reduce<ITicketSummary>((summary, ticket) => {
    summary.total += 1;
    if (ticket.status !== 'Résolu' && ticket.status !== 'Fermé') {
      summary.open += 1;
    }
    if (ticket.status === 'En attente') {
      summary.waiting += 1;
    }
    if (ticket.status === 'Résolu' || ticket.status === 'Fermé') {
      summary.resolved += 1;
    }
    if (ticket.priority === 'Critique' && ticket.status !== 'Fermé') {
      summary.critical += 1;
    }
    return summary;
  }, { total: 0, open: 0, waiting: 0, resolved: 0, critical: 0 });
}

export function formatDate(value?: string): string {
  if (!value) {
    return 'Non définie';
  }
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(value));
}

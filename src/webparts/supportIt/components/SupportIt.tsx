import * as React from 'react';
import styles from './SupportIt.module.scss';
import type { ISupportItProps } from './ISupportItProps';
import {
  ticketCategories,
  ticketPriorities,
  ticketStatuses,
  type INewTicket,
  type ITicket,
  type ITicketUpdate,
  type IUserContext
} from '../models/Ticket';
import { formatDate, summarizeTickets } from '../utils/ticketUtils';

type View = 'dashboard' | 'create' | 'tickets';

const initialTicket: INewTicket = {
  subject: '',
  description: '',
  category: 'Software',
  priority: 'Normal'
};

const statusClass: Record<ITicket['status'], string> = {
  'New': styles.statusNew,
  'In progress': styles.statusActive,
  'Waiting': styles.statusWaiting,
  'Resolved': styles.statusResolved,
  'Closed': styles.statusClosed
};

const priorityClass: Record<ITicket['priority'], string> = {
  'Low': styles.priorityLow,
  'Normal': styles.priorityNormal,
  'High': styles.priorityHigh,
  'Critical': styles.priorityCritical
};

const SupportIt: React.FC<ISupportItProps> = ({ service, userDisplayName }) => {
  const firstName = userDisplayName
    .trim()
    .split(/\s+/)[0]
    .replace(/^./, character => character.toUpperCase());
  const [view, setView] = React.useState<View>('dashboard');
  const [context, setContext] = React.useState<IUserContext>();
  const [tickets, setTickets] = React.useState<ITicket[]>([]);
  const [selectedTicket, setSelectedTicket] = React.useState<ITicket>();
  const [draft, setDraft] = React.useState<INewTicket>(initialTicket);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [notice, setNotice] = React.useState<string>();

  const load = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(undefined);
    try {
      const currentContext = await service.getUserContext();
      const items = await service.getTickets(currentContext);
      setContext(currentContext);
      setTickets(items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load tickets.');
    } finally {
      setLoading(false);
    }
  }, [service]);

  React.useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const summary = React.useMemo(() => summarizeTickets(tickets), [tickets]);

  const createTicket = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const created = await service.createTicket(draft);
      setTickets(current => [created, ...current]);
      setDraft(initialTicket);
      setSelectedTicket(created);
      setNotice(`Ticket #${created.id} was created. The Support IT team has been notified.`);
      setView('tickets');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The ticket could not be created.');
    } finally {
      setSaving(false);
    }
  };

  const updateTicket = async (
    event: React.FormEvent<HTMLFormElement>,
    ticket: ITicket
  ): Promise<void> => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const update: ITicketUpdate = {
      status: form.get('status') as ITicketUpdate['status'],
      priority: form.get('priority') as ITicketUpdate['priority'],
      dueDate: String(form.get('dueDate') || '') || undefined,
      resolution: String(form.get('resolution') || '') || undefined
    };
    setSaving(true);
    setError(undefined);
    try {
      await service.updateTicket(ticket.id, update);
      const updated = {
        ...ticket,
        ...update,
        modified: new Date().toISOString()
      };
      setTickets(current => current.map(item => item.id === ticket.id ? updated : item));
      setSelectedTicket(updated);
      setNotice(`Ticket #${ticket.id} was updated.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The update failed.');
    } finally {
      setSaving(false);
    }
  };

  const navigate = (nextView: View): void => {
    setView(nextView);
    setSelectedTicket(undefined);
    setNotice(undefined);
    setError(undefined);
  };

  const renderStatus = (ticket: ITicket): React.ReactElement => (
    <span className={`${styles.badge} ${statusClass[ticket.status]}`}>{ticket.status}</span>
  );

  const renderTickets = (): React.ReactElement => (
    <section aria-labelledby="tickets-title">
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.eyebrow}>{context?.isAgent ? 'Team view' : 'Personal tracking'}</span>
          <h2 id="tickets-title">{context?.isAgent ? 'All tickets' : 'My tickets'}</h2>
        </div>
        <button className={styles.primaryButton} type="button" onClick={() => navigate('create')}>
          + Create a ticket
        </button>
      </div>
      {tickets.length === 0 ? (
        <div className={styles.emptyState}>
          <span aria-hidden="true">✓</span>
          <h3>No tickets yet</h3>
          <p>Everything working? Great. We are here whenever you need us.</p>
        </div>
      ) : (
        <div className={styles.ticketGrid}>
          {tickets.map(ticket => (
            <button
              className={styles.ticketCard}
              type="button"
              key={ticket.id}
              onClick={() => setSelectedTicket(ticket)}
              aria-label={`Open ticket ${ticket.id}, ${ticket.subject}`}
            >
              <span className={styles.ticketNumber}>#{ticket.id}</span>
              <span className={`${styles.priorityStripe} ${priorityClass[ticket.priority]}`} />
              <span className={styles.cardBadges}>
                {renderStatus(ticket)}
                <span className={styles.category}>{ticket.category}</span>
              </span>
              <strong>{ticket.subject}</strong>
              <span className={styles.cardDescription}>{ticket.description}</span>
              <span className={styles.cardFooter}>
                <span>Updated {formatDate(ticket.modified)}</span>
                <span aria-hidden="true">→</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );

  const renderDetail = (ticket: ITicket): React.ReactElement => (
    <section aria-labelledby="detail-title" className={styles.detail}>
      <button className={styles.backButton} type="button" onClick={() => setSelectedTicket(undefined)}>
        ← Back to tickets
      </button>
      <div className={styles.detailHero}>
        <div>
          <span className={styles.eyebrow}>Ticket #{ticket.id}</span>
          <h2 id="detail-title">{ticket.subject}</h2>
          <div className={styles.detailBadges}>{renderStatus(ticket)} <span className={styles.category}>{ticket.category}</span></div>
        </div>
        <div className={`${styles.priorityBlock} ${priorityClass[ticket.priority]}`}>
          <span>Priority</span><strong>{ticket.priority}</strong>
        </div>
      </div>
      <div className={styles.detailGrid}>
        <article className={styles.detailBody}>
          <h3>Description</h3>
          <p>{ticket.description}</p>
          {ticket.resolution && <><h3>Resolution</h3><p>{ticket.resolution}</p></>}
        </article>
        <aside className={styles.metaPanel} aria-label="Informations du ticket">
          <dl>
            <div><dt>Requester</dt><dd>{ticket.author.displayName}</dd></div>
            <div><dt>Assigned to</dt><dd>{ticket.assignedTo?.displayName || 'Unassigned'}</dd></div>
            <div><dt>Created</dt><dd>{formatDate(ticket.created)}</dd></div>
            <div><dt>Due date</dt><dd>{formatDate(ticket.dueDate)}</dd></div>
          </dl>
        </aside>
      </div>
      {context?.isAgent && (
        <form className={styles.agentForm} onSubmit={event => { updateTicket(event, ticket).catch(() => undefined); }}>
          <div className={styles.sectionHeading}>
            <div><span className={styles.eyebrow}>Agent workspace</span><h3>Update ticket</h3></div>
          </div>
          <div className={styles.formGrid}>
            <label>Status
              <select name="status" defaultValue={ticket.status}>
                {ticketStatuses.map(value => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>Priority
              <select name="priority" defaultValue={ticket.priority}>
                {ticketPriorities.map(value => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>Due date
              <input name="dueDate" type="date" defaultValue={ticket.dueDate?.slice(0, 10)} />
            </label>
            <label className={styles.fullWidth}>Resolution
              <textarea name="resolution" rows={4} defaultValue={ticket.resolution} />
            </label>
          </div>
          <button className={styles.primaryButton} type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      )}
    </section>
  );

  const renderCreate = (): React.ReactElement => (
    <section className={styles.createPanel} aria-labelledby="create-title">
      <div>
        <span className={styles.eyebrow}>Need help?</span>
        <h2 id="create-title">Create a ticket</h2>
        <p>Describe your request clearly. Our team will get back to you promptly.</p>
      </div>
      <form onSubmit={event => { createTicket(event).catch(() => undefined); }}>
        <label>Subject
          <input
            required
            maxLength={255}
            value={draft.subject}
            onChange={event => setDraft({ ...draft, subject: event.target.value })}
            placeholder="Example: Unable to connect to the VPN"
          />
        </label>
        <label>Description
          <textarea
            required
            minLength={10}
            rows={6}
            value={draft.description}
            onChange={event => setDraft({ ...draft, description: event.target.value })}
            placeholder="Context, error message, impact…"
          />
        </label>
        <div className={styles.formGrid}>
          <label>Category
            <select
              value={draft.category}
              onChange={event => setDraft({ ...draft, category: event.target.value as INewTicket['category'] })}
            >
              {ticketCategories.map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>Priority
            <select
              value={draft.priority}
              onChange={event => setDraft({ ...draft, priority: event.target.value as INewTicket['priority'] })}
            >
              {ticketPriorities.map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
        </div>
        <div className={styles.formActions}>
          <button className={styles.secondaryButton} type="button" onClick={() => navigate('dashboard')}>Cancel</button>
          <button className={styles.primaryButton} type="submit" disabled={saving}>
            {saving ? 'Creating…' : 'Submit ticket'}
          </button>
        </div>
      </form>
    </section>
  );

  return (
    <main className={styles.supportIt}>
      <a className={styles.skipLink} href="#support-content">Skip to content</a>
      <header className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroContent}>
          <span className={styles.heroLabel}>Learn IT · Helpdesk portal</span>
          <h1>
            <span>Hello {firstName},</span>
            welcome to Learn IT Helpdesk
          </h1>
          <p>Fast, simple support for every question, incident and request.</p>
        </div>
        {context?.isAgent && <span className={styles.agentBadge}>Agent mode</span>}
      </header>
      <nav className={styles.nav} aria-label="Portal navigation">
        <button aria-current={view === 'dashboard' ? 'page' : undefined} onClick={() => navigate('dashboard')}>Dashboard</button>
        <button aria-current={view === 'create' ? 'page' : undefined} onClick={() => navigate('create')}>Create a ticket</button>
        <button aria-current={view === 'tickets' ? 'page' : undefined} onClick={() => navigate('tickets')}>
          {context?.isAgent ? 'All tickets' : 'My tickets'}
        </button>
      </nav>
      <div id="support-content" className={styles.content} tabIndex={-1}>
        {error && <div className={styles.error} role="alert"><strong>Something went wrong.</strong><span>{error}</span><button type="button" onClick={() => { load().catch(() => undefined); }}>Try again</button></div>}
        {notice && <div className={styles.notice} role="status">{notice}</div>}
        {loading ? (
          <div className={styles.loading} role="status"><span /><p>Loading your support workspace…</p></div>
        ) : selectedTicket ? renderDetail(selectedTicket) : view === 'create' ? renderCreate() : view === 'tickets' ? renderTickets() : (
          <>
            <section className={styles.summary} aria-labelledby="summary-title">
              <div className={styles.sectionHeading}>
                <div><span className={styles.eyebrow}>Overview</span><h2 id="summary-title">Your requests at a glance</h2></div>
                <button className={styles.primaryButton} type="button" onClick={() => navigate('create')}>+ Create a ticket</button>
              </div>
              <div className={styles.summaryGrid}>
                <button className={styles.summaryCard} onClick={() => navigate('tickets')}><span>Open tickets</span><strong>{summary.open}</strong><small>Needs attention</small></button>
                <button className={`${styles.summaryCard} ${styles.yellowCard}`} onClick={() => navigate('tickets')}><span>Waiting</span><strong>{summary.waiting}</strong><small>Action required</small></button>
                <button className={`${styles.summaryCard} ${styles.skyCard}`} onClick={() => navigate('tickets')}><span>Resolved</span><strong>{summary.resolved}</strong><small>Requests completed</small></button>
                <button className={`${styles.summaryCard} ${styles.coralCard}`} onClick={() => navigate('tickets')}><span>Critical</span><strong>{summary.critical}</strong><small>Immediate priority</small></button>
              </div>
            </section>
            <section className={styles.recent} aria-labelledby="recent-title">
              <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Recent activity</span><h2 id="recent-title">Latest tickets</h2></div><button className={styles.textButton} onClick={() => navigate('tickets')}>View all →</button></div>
              {tickets.length === 0 ? <div className={styles.emptyState}><h3>No tickets</h3><p>Create your first request to get started.</p></div> :
                <div className={styles.recentList}>{tickets.slice(0, 3).map(ticket => <button key={ticket.id} onClick={() => setSelectedTicket(ticket)}><span className={styles.ticketNumber}>#{ticket.id}</span><strong>{ticket.subject}</strong>{renderStatus(ticket)}<span>{formatDate(ticket.modified)}</span></button>)}</div>}
            </section>
          </>
        )}
      </div>
    </main>
  );
};

export default SupportIt;

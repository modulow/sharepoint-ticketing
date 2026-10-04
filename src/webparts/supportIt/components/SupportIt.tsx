import * as React from 'react';
import styles from './SupportIt.module.scss';
import type { ISupportItProps } from './ISupportItProps';
import {
  ticketPriorities,
  ticketStatuses,
  type ITicket,
  type ITicketUpdate,
  type IUserContext
} from '../models/Ticket';
import { formatDate, summarizeTickets } from '../utils/ticketUtils';
import TicketDialog from './TicketDialog';
import { openIntakePopup } from '../utils/intakePopup';

type View = 'dashboard' | 'tickets';

const resources = [
  {
    label: 'Account',
    title: 'Reset your password',
    description: 'Recover access to your Microsoft 365 account securely.',
    href: 'https://passwordreset.microsoftonline.com/',
    accent: 'yellow'
  },
  {
    label: 'Collaboration',
    title: 'Microsoft Teams help',
    description: 'Find guidance for meetings, chat, calls and collaboration.',
    href: 'https://support.microsoft.com/teams',
    accent: 'sky'
  },
  {
    label: 'Email',
    title: 'Outlook support',
    description: 'Resolve common email, calendar and mailbox issues.',
    href: 'https://support.microsoft.com/outlook',
    accent: 'blue'
  },
  {
    label: 'Files',
    title: 'OneDrive essentials',
    description: 'Sync, share and recover your work files.',
    href: 'https://support.microsoft.com/onedrive',
    accent: 'mint'
  },
  {
    label: 'Security',
    title: 'Protect your account',
    description: 'Recognise phishing and keep your devices secure.',
    href: 'https://support.microsoft.com/security',
    accent: 'coral'
  },
  {
    label: 'Self-service',
    title: 'Microsoft 365 help',
    description: 'Browse product documentation and troubleshooting guides.',
    href: 'https://support.microsoft.com/microsoft-365',
    accent: 'navy'
  }
] as const;

const resourceAccentClass: Record<typeof resources[number]['accent'], string> = {
  yellow: styles.resourceYellow,
  sky: styles.resourceSky,
  blue: styles.resourceBlue,
  mint: styles.resourceMint,
  coral: styles.resourceCoral,
  navy: styles.resourceNavy
};

const faqs = [
  {
    question: 'How quickly will Support IT respond?',
    answer: 'Critical incidents are prioritised immediately. Normal requests are reviewed during business hours and tracked in this portal.'
  },
  {
    question: 'What should I include in a ticket?',
    answer: 'Describe what you were doing, what happened, any error message, the affected device or service, and the impact on your work.'
  },
  {
    question: 'Can I follow the progress of my request?',
    answer: 'Yes. Open My tickets to see the current status, latest update, assignment and due date for every request you created.'
  },
  {
    question: 'When should I choose Critical priority?',
    answer: 'Use Critical only for widespread outages, security incidents, or issues preventing essential work with no available workaround.'
  },
  {
    question: 'Can other users see my tickets?',
    answer: 'Standard users can only access tickets they created. Authorised Support IT agents can access all tickets to investigate and resolve them.'
  }
] as const;

const supportTeam = [
  { name: 'Olivia Martin', role: 'Service desk lead', initials: 'OM', accent: 'yellow' },
  { name: 'Noah Williams', role: 'Workplace specialist', initials: 'NW', accent: 'sky' },
  { name: 'Emma Davis', role: 'Microsoft 365 expert', initials: 'ED', accent: 'coral' },
  { name: 'Liam Anderson', role: 'Network engineer', initials: 'LA', accent: 'mint' },
  { name: 'Sophia Brown', role: 'Security analyst', initials: 'SB', accent: 'blue' },
  { name: 'Lucas Wilson', role: 'Support technician', initials: 'LW', accent: 'white' }
] as const;

const teamAccentClass: Record<typeof supportTeam[number]['accent'], string> = {
  yellow: styles.avatarYellow,
  sky: styles.avatarSky,
  coral: styles.avatarCoral,
  mint: styles.avatarMint,
  blue: styles.avatarBlue,
  white: styles.avatarWhite
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
  const [intakeBlocked, setIntakeBlocked] = React.useState(false);
  const [intakePopup, setIntakePopup] = React.useState<Window>();
  const [context, setContext] = React.useState<IUserContext>();
  const [tickets, setTickets] = React.useState<ITicket[]>([]);
  const [selectedTicket, setSelectedTicket] = React.useState<ITicket>();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [notice, setNotice] = React.useState<string>();

  const load = React.useCallback(async (background = false): Promise<void> => {
    if (!background) setLoading(true);
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

  React.useEffect(() => {
    if (!intakePopup) return;
    const timer = window.setInterval(() => {
      if (intakePopup.closed) {
        setIntakePopup(undefined);
        setNotice(undefined);
        load(true).catch(() => undefined);
      }
    }, 750);
    return () => window.clearInterval(timer);
  }, [intakePopup, load]);

  const summary = React.useMemo(() => summarizeTickets(tickets), [tickets]);

  const updateTicket = async (
    event: React.FormEvent<HTMLFormElement>,
    ticket: ITicket
  ): Promise<void> => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextStatus = form.get('status') as ITicket['status'];
    const nextPriority = form.get('priority') as ITicket['priority'];
    const nextDueDate = String(form.get('dueDate') || '');
    const nextResolution = String(form.get('resolution') || '');
    const update: ITicketUpdate = {};
    if (nextStatus !== ticket.status) update.status = nextStatus;
    if (nextPriority !== ticket.priority) update.priority = nextPriority;
    if (nextDueDate !== (ticket.dueDate?.slice(0, 10) || '')) update.dueDate = nextDueDate;
    if (nextResolution !== (ticket.resolution || '')) update.resolution = nextResolution;
    if (!Object.keys(update).length) {
      setNotice(`Ticket #${ticket.id} has no changes to save.`);
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await service.updateTicket(ticket.id, update);
      const updated: ITicket = {
        ...ticket,
        ...(update.status !== undefined ? { status: update.status } : {}),
        ...(update.priority !== undefined ? { priority: update.priority } : {}),
        ...(update.dueDate !== undefined ? { dueDate: update.dueDate } : {}),
        ...(update.resolution !== undefined ? { resolution: update.resolution } : {}),
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

  const openIntake = (): void => {
    setError(undefined);
    if (intakePopup && !intakePopup.closed) {
      intakePopup.focus();
      return;
    }
    const popup = openIntakePopup(service.getIntakeFormUrl());
    setIntakePopup(popup);
    setIntakeBlocked(!popup);
    if (popup) setNotice('The secure Kiwi form is open in a small window. Submit there, then close it to refresh your tickets.');
  };

  const closeIntakeFallback = (): void => {
    setIntakeBlocked(false);
    load(true).catch(() => undefined);
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
        <button className={styles.primaryButton} type="button" onClick={openIntake}>
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
      <button className={styles.backButton} type="button" disabled={saving} onClick={() => setSelectedTicket(undefined)}>
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
      {error && <div className={styles.error} role="alert">{error}</div>}
      {notice && <div className={styles.notice} role="status">{notice}</div>}
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
              <textarea name="resolution" rows={4} maxLength={255} defaultValue={ticket.resolution} />
            </label>
          </div>
          <button className={styles.primaryButton} type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      )}
    </section>
  );

  return (
    <main className={styles.supportIt}>
      <a className={styles.skipLink} href="#support-content">Skip to content</a>
      <header className={styles.hero}>
        <div className={styles.heroContent}>
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
        <button onClick={openIntake}>Create a ticket</button>
        <button aria-current={view === 'tickets' ? 'page' : undefined} onClick={() => navigate('tickets')}>
          {context?.isAgent ? 'All tickets' : 'My tickets'}
        </button>
        <button type="button" disabled={loading} onClick={() => { load(true).catch(() => undefined); }}>Refresh tickets</button>
      </nav>
      <div id="support-content" className={styles.content} tabIndex={-1}>
        {error && !selectedTicket && <div className={styles.error} role="alert"><strong>Something went wrong.</strong><span>{error}</span><button type="button" onClick={() => { load().catch(() => undefined); }}>Try again</button></div>}
        {notice && !selectedTicket && <div className={styles.notice} role="status">{notice}</div>}
        {loading ? (
          <div className={styles.loading} role="status"><span /><p>Loading your support workspace…</p></div>
        ) : view === 'tickets' ? renderTickets() : (
          <>
            <section className={styles.summary} aria-labelledby="summary-title">
              <div className={styles.sectionHeading}>
                <div><span className={styles.eyebrow}>Overview</span><h2 id="summary-title">Your requests at a glance</h2></div>
                <button className={styles.primaryButton} type="button" onClick={openIntake}>+ Create a ticket</button>
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
            <section className={styles.resources} aria-labelledby="resources-title">
              <div className={styles.sectionHeading}>
                <div><span className={styles.eyebrow}>Self-service</span><h2 id="resources-title">Useful resources</h2></div>
              </div>
              <div className={styles.resourceGrid}>
                {resources.map((resource, index) => (
                  <a
                    className={`${styles.resourceCard} ${resourceAccentClass[resource.accent]}`}
                    href={resource.href}
                    key={resource.title}
                    target="_blank"
                    rel="noreferrer"
                    style={{ '--card-delay': `${index * 70}ms` } as React.CSSProperties}
                  >
                    <span>{resource.label}</span>
                    <strong>{resource.title}</strong>
                    <p>{resource.description}</p>
                    <b aria-hidden="true">↗</b>
                  </a>
                ))}
              </div>
            </section>
            <section className={styles.faq} aria-labelledby="faq-title">
              <div className={styles.sectionHeading}>
                <div><span className={styles.eyebrow}>Good to know</span><h2 id="faq-title">Frequently asked questions</h2></div>
              </div>
              <div className={styles.faqList}>
                {faqs.map((faq, index) => (
                  <details key={faq.question} style={{ '--card-delay': `${index * 60}ms` } as React.CSSProperties}>
                    <summary>{faq.question}<span aria-hidden="true">+</span></summary>
                    <p>{faq.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
      <footer className={styles.teamFooter} aria-labelledby="team-title">
        <div className={styles.teamIntro}>
          <span className={styles.footerEyebrow}>People behind the helpdesk</span>
          <h2 id="team-title">Meet the Support IT team</h2>
          <p>Six specialists working together to keep your digital workplace moving.</p>
        </div>
        <ul className={styles.teamList}>
          {supportTeam.map((member, index) => (
            <li key={member.name} style={{ '--card-delay': `${index * 65}ms` } as React.CSSProperties}>
              <span className={`${styles.teamAvatar} ${teamAccentClass[member.accent]}`} aria-hidden="true">
                {member.initials}
              </span>
              <span className={styles.teamMember}>
                <strong>{member.name}</strong>
                <small>{member.role}</small>
              </span>
            </li>
          ))}
        </ul>
        <div className={styles.footerBottom}>
          <span>European Parliament · Support IT</span>
          <span>Here when technology gets in the way.</span>
        </div>
      </footer>
      {intakeBlocked && (
        <TicketDialog title="Kiwi form window blocked" onDismiss={closeIntakeFallback}>
          <p role="alert">Your browser blocked the form popup. Allow popups for this site and try again, or use the secure link below.</p>
          <p>Submit your request in the official form before closing it. Your ticketing page stays open; closing this dialog refreshes tickets but does not submit a request.</p>
          <div className={styles.formActions}>
            <button className={styles.secondaryButton} type="button" onClick={() => { setIntakeBlocked(false); openIntake(); }}>Try popup again</button>
            <a className={styles.primaryButton} href={service.getIntakeFormUrl()} target="_blank" rel="noreferrer">Open secure Kiwi form</a>
          </div>
        </TicketDialog>
      )}
      {selectedTicket && (
        <TicketDialog title={`Ticket #${selectedTicket.id}`} dismissDisabled={saving} onDismiss={() => setSelectedTicket(undefined)}>
          {renderDetail(selectedTicket)}
        </TicketDialog>
      )}
    </main>
  );
};

export default SupportIt;

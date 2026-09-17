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
  category: 'Logiciel',
  priority: 'Normale'
};

const statusClass: Record<ITicket['status'], string> = {
  'Nouveau': styles.statusNew,
  'En cours': styles.statusActive,
  'En attente': styles.statusWaiting,
  'Résolu': styles.statusResolved,
  'Fermé': styles.statusClosed
};

const priorityClass: Record<ITicket['priority'], string> = {
  'Basse': styles.priorityLow,
  'Normale': styles.priorityNormal,
  'Haute': styles.priorityHigh,
  'Critique': styles.priorityCritical
};

const SupportIt: React.FC<ISupportItProps> = ({ service, userDisplayName }) => {
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
      setError(caught instanceof Error ? caught.message : 'Impossible de charger les tickets.');
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
      setNotice(`Ticket #${created.id} créé. L'équipe Support IT a été informée.`);
      setView('tickets');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Le ticket n’a pas pu être créé.');
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
      setNotice(`Ticket #${ticket.id} mis à jour.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'La mise à jour a échoué.');
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
          <span className={styles.eyebrow}>{context?.isAgent ? 'Vue équipe' : 'Suivi personnel'}</span>
          <h2 id="tickets-title">{context?.isAgent ? 'Tous les tickets' : 'Mes tickets'}</h2>
        </div>
        <button className={styles.primaryButton} type="button" onClick={() => navigate('create')}>
          + Créer un ticket
        </button>
      </div>
      {tickets.length === 0 ? (
        <div className={styles.emptyState}>
          <span aria-hidden="true">✓</span>
          <h3>Aucun ticket pour le moment</h3>
          <p>Tout fonctionne ? Tant mieux. Nous sommes là dès que vous en avez besoin.</p>
        </div>
      ) : (
        <div className={styles.ticketGrid}>
          {tickets.map(ticket => (
            <button
              className={styles.ticketCard}
              type="button"
              key={ticket.id}
              onClick={() => setSelectedTicket(ticket)}
              aria-label={`Ouvrir le ticket ${ticket.id}, ${ticket.subject}`}
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
                <span>Modifié le {formatDate(ticket.modified)}</span>
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
        ← Retour aux tickets
      </button>
      <div className={styles.detailHero}>
        <div>
          <span className={styles.eyebrow}>Ticket #{ticket.id}</span>
          <h2 id="detail-title">{ticket.subject}</h2>
          <div className={styles.detailBadges}>{renderStatus(ticket)} <span className={styles.category}>{ticket.category}</span></div>
        </div>
        <div className={`${styles.priorityBlock} ${priorityClass[ticket.priority]}`}>
          <span>Priorité</span><strong>{ticket.priority}</strong>
        </div>
      </div>
      <div className={styles.detailGrid}>
        <article className={styles.detailBody}>
          <h3>Description</h3>
          <p>{ticket.description}</p>
          {ticket.resolution && <><h3>Résolution</h3><p>{ticket.resolution}</p></>}
        </article>
        <aside className={styles.metaPanel} aria-label="Informations du ticket">
          <dl>
            <div><dt>Demandeur</dt><dd>{ticket.author.displayName}</dd></div>
            <div><dt>Assigné à</dt><dd>{ticket.assignedTo?.displayName || 'Non assigné'}</dd></div>
            <div><dt>Créé le</dt><dd>{formatDate(ticket.created)}</dd></div>
            <div><dt>Échéance</dt><dd>{formatDate(ticket.dueDate)}</dd></div>
          </dl>
        </aside>
      </div>
      {context?.isAgent && (
        <form className={styles.agentForm} onSubmit={event => { updateTicket(event, ticket).catch(() => undefined); }}>
          <div className={styles.sectionHeading}>
            <div><span className={styles.eyebrow}>Espace agent</span><h3>Mettre à jour le ticket</h3></div>
          </div>
          <div className={styles.formGrid}>
            <label>Statut
              <select name="status" defaultValue={ticket.status}>
                {ticketStatuses.map(value => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>Priorité
              <select name="priority" defaultValue={ticket.priority}>
                {ticketPriorities.map(value => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>Échéance
              <input name="dueDate" type="date" defaultValue={ticket.dueDate?.slice(0, 10)} />
            </label>
            <label className={styles.fullWidth}>Résolution
              <textarea name="resolution" rows={4} defaultValue={ticket.resolution} />
            </label>
          </div>
          <button className={styles.primaryButton} type="submit" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
          </button>
        </form>
      )}
    </section>
  );

  const renderCreate = (): React.ReactElement => (
    <section className={styles.createPanel} aria-labelledby="create-title">
      <div>
        <span className={styles.eyebrow}>Besoin d’aide ?</span>
        <h2 id="create-title">Créer un ticket</h2>
        <p>Décrivez votre demande avec précision. Notre équipe reviendra vers vous rapidement.</p>
      </div>
      <form onSubmit={event => { createTicket(event).catch(() => undefined); }}>
        <label>Sujet
          <input
            required
            maxLength={255}
            value={draft.subject}
            onChange={event => setDraft({ ...draft, subject: event.target.value })}
            placeholder="Ex. Impossible de me connecter au VPN"
          />
        </label>
        <label>Description
          <textarea
            required
            minLength={10}
            rows={6}
            value={draft.description}
            onChange={event => setDraft({ ...draft, description: event.target.value })}
            placeholder="Contexte, message d’erreur, impact…"
          />
        </label>
        <div className={styles.formGrid}>
          <label>Catégorie
            <select
              value={draft.category}
              onChange={event => setDraft({ ...draft, category: event.target.value as INewTicket['category'] })}
            >
              {ticketCategories.map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>Priorité
            <select
              value={draft.priority}
              onChange={event => setDraft({ ...draft, priority: event.target.value as INewTicket['priority'] })}
            >
              {ticketPriorities.map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
        </div>
        <div className={styles.formActions}>
          <button className={styles.secondaryButton} type="button" onClick={() => navigate('dashboard')}>Annuler</button>
          <button className={styles.primaryButton} type="submit" disabled={saving}>
            {saving ? 'Création…' : 'Envoyer le ticket'}
          </button>
        </div>
      </form>
    </section>
  );

  return (
    <main className={styles.supportIt}>
      <a className={styles.skipLink} href="#support-content">Aller au contenu</a>
      <header className={styles.hero}>
        <div className={styles.heroMark} aria-hidden="true"><span /><span /><span /></div>
        <div>
          <span className={styles.heroLabel}>Support IT · modulow</span>
          <h1>Bonjour {userDisplayName.split(' ')[0]}</h1>
          <p>Une question, un incident, une demande ? Centralisez tout ici.</p>
        </div>
        {context?.isAgent && <span className={styles.agentBadge}>Mode agent</span>}
      </header>
      <nav className={styles.nav} aria-label="Navigation du portail">
        <button aria-current={view === 'dashboard' ? 'page' : undefined} onClick={() => navigate('dashboard')}>Tableau de bord</button>
        <button aria-current={view === 'create' ? 'page' : undefined} onClick={() => navigate('create')}>Créer un ticket</button>
        <button aria-current={view === 'tickets' ? 'page' : undefined} onClick={() => navigate('tickets')}>
          {context?.isAgent ? 'Tous les tickets' : 'Mes tickets'}
        </button>
      </nav>
      <div id="support-content" className={styles.content} tabIndex={-1}>
        {error && <div className={styles.error} role="alert"><strong>Une erreur est survenue.</strong><span>{error}</span><button type="button" onClick={() => { load().catch(() => undefined); }}>Réessayer</button></div>}
        {notice && <div className={styles.notice} role="status">{notice}</div>}
        {loading ? (
          <div className={styles.loading} role="status"><span /><p>Chargement de votre espace support…</p></div>
        ) : selectedTicket ? renderDetail(selectedTicket) : view === 'create' ? renderCreate() : view === 'tickets' ? renderTickets() : (
          <>
            <section className={styles.summary} aria-labelledby="summary-title">
              <div className={styles.sectionHeading}>
                <div><span className={styles.eyebrow}>Vue d’ensemble</span><h2 id="summary-title">Vos demandes en un coup d’œil</h2></div>
                <button className={styles.primaryButton} type="button" onClick={() => navigate('create')}>+ Créer un ticket</button>
              </div>
              <div className={styles.summaryGrid}>
                <button className={styles.summaryCard} onClick={() => navigate('tickets')}><span>Tickets ouverts</span><strong>{summary.open}</strong><small>À suivre</small></button>
                <button className={`${styles.summaryCard} ${styles.yellowCard}`} onClick={() => navigate('tickets')}><span>En attente</span><strong>{summary.waiting}</strong><small>Action requise</small></button>
                <button className={`${styles.summaryCard} ${styles.skyCard}`} onClick={() => navigate('tickets')}><span>Résolus</span><strong>{summary.resolved}</strong><small>Demandes traitées</small></button>
                <button className={`${styles.summaryCard} ${styles.coralCard}`} onClick={() => navigate('tickets')}><span>Critiques</span><strong>{summary.critical}</strong><small>Priorité immédiate</small></button>
              </div>
            </section>
            <section className={styles.recent} aria-labelledby="recent-title">
              <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Activité récente</span><h2 id="recent-title">Derniers tickets</h2></div><button className={styles.textButton} onClick={() => navigate('tickets')}>Tout voir →</button></div>
              {tickets.length === 0 ? <div className={styles.emptyState}><h3>Aucun ticket</h3><p>Créez votre première demande pour commencer.</p></div> :
                <div className={styles.recentList}>{tickets.slice(0, 3).map(ticket => <button key={ticket.id} onClick={() => setSelectedTicket(ticket)}><span className={styles.ticketNumber}>#{ticket.id}</span><strong>{ticket.subject}</strong>{renderStatus(ticket)}<span>{formatDate(ticket.modified)}</span></button>)}</div>}
            </section>
          </>
        )}
      </div>
    </main>
  );
};

export default SupportIt;

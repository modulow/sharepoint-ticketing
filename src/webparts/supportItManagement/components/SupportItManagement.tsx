import * as React from 'react';
import styles from './SupportItManagement.module.scss';
import type { ISupportItManagementProps } from './ISupportItManagementProps';
import {
  ticketCategories,
  ticketPriorities,
  ticketStatuses,
  type ITicket,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
  type IUserContext,
  type IUserSummary
} from '../../supportIt/models/Ticket';
import { formatDate } from '../../supportIt/utils/ticketUtils';

type AssignmentFilter = 'all' | 'assigned' | 'unassigned';
type AgentFilter = 'all' | 'unassigned' | number;

interface IEditDraft {
  status: TicketStatus;
  priority: TicketPriority;
  assignedToId: string;
  dueDate: string;
  resolution: string;
}

const toDateInput = (value?: string): string => {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

const toDraft = (ticket: ITicket): IEditDraft => ({
  status: ticket.status,
  priority: ticket.priority,
  assignedToId: ticket.assignedTo ? String(ticket.assignedTo.id) : '',
  dueDate: toDateInput(ticket.dueDate),
  resolution: ticket.resolution || ''
});

const SupportItManagement: React.FC<ISupportItManagementProps> = ({ service }) => {
  const [context, setContext] = React.useState<IUserContext>();
  const [tickets, setTickets] = React.useState<ITicket[]>([]);
  const [users, setUsers] = React.useState<IUserSummary[]>([]);
  const [selectedId, setSelectedId] = React.useState<number>();
  const [draft, setDraft] = React.useState<IEditDraft>();
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<TicketStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = React.useState<TicketPriority | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = React.useState<TicketCategory | 'all'>('all');
  const [assignmentFilter, setAssignmentFilter] = React.useState<AssignmentFilter>('all');
  const [agentFilter, setAgentFilter] = React.useState<AgentFilter>('all');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [notice, setNotice] = React.useState<string>();

  const load = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(undefined);
    try {
      const userContext = await service.getUserContext();
      setContext(userContext);
      if (!userContext.isAgent) {
        setTickets([]);
        setUsers([]);
        return;
      }
      const [loadedTickets, loadedUsers] = await Promise.all([
        service.getTickets(userContext),
        service.getAssignableUsers()
      ]);
      setTickets(loadedTickets);
      setUsers(loadedUsers);
      setSelectedId(current => {
        if (current && loadedTickets.some(ticket => ticket.id === current)) {
          return current;
        }
        return loadedTickets[0]?.id;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The management dashboard could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [service]);

  React.useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const selectedTicket = React.useMemo(
    () => tickets.find(ticket => ticket.id === selectedId),
    [selectedId, tickets]
  );

  React.useEffect(() => {
    setDraft(selectedTicket ? toDraft(selectedTicket) : undefined);
  }, [selectedTicket]);

  const filteredTickets = React.useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return tickets.filter(ticket => {
      const matchesSearch = !query || [
        String(ticket.id),
        ticket.subject,
        ticket.description,
        ticket.author.displayName,
        ticket.author.email,
        ticket.assignedTo?.displayName || ''
      ].some(value => value.toLocaleLowerCase().includes(query));
      const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter;
      const matchesPriority = priorityFilter === 'all' || ticket.priority === priorityFilter;
      const matchesCategory = categoryFilter === 'all' || ticket.category === categoryFilter;
      const matchesAssignment =
        assignmentFilter === 'all' ||
        (assignmentFilter === 'assigned' && Boolean(ticket.assignedTo)) ||
        (assignmentFilter === 'unassigned' && !ticket.assignedTo);
      const matchesAgent =
        agentFilter === 'all' ||
        (agentFilter === 'unassigned' && !ticket.assignedTo) ||
        (typeof agentFilter === 'number' && ticket.assignedTo?.id === agentFilter);
      return matchesSearch && matchesStatus && matchesPriority && matchesCategory && matchesAssignment && matchesAgent;
    });
  }, [agentFilter, assignmentFilter, categoryFilter, priorityFilter, search, statusFilter, tickets]);

  const metrics = React.useMemo(() => ({
    total: tickets.length,
    open: tickets.filter(ticket => ticket.status !== 'Resolved' && ticket.status !== 'Closed').length,
    critical: tickets.filter(ticket => ticket.priority === 'Critical' && ticket.status !== 'Closed').length,
    unassigned: tickets.filter(ticket => !ticket.assignedTo && ticket.status !== 'Closed').length
  }), [tickets]);

  const agentWorkload = React.useMemo(() => {
    const workload = new Map<number, { user: IUserSummary; total: number; open: number }>();
    tickets.forEach(ticket => {
      if (!ticket.assignedTo) {
        return;
      }
      const existing = workload.get(ticket.assignedTo.id) || {
        user: ticket.assignedTo,
        total: 0,
        open: 0
      };
      existing.total += 1;
      if (ticket.status !== 'Resolved' && ticket.status !== 'Closed') {
        existing.open += 1;
      }
      workload.set(ticket.assignedTo.id, existing);
    });
    return Array.from(workload.values()).sort((left, right) =>
      left.user.displayName.localeCompare(right.user.displayName)
    );
  }, [tickets]);

  const save = async (): Promise<void> => {
    if (!selectedTicket || !draft) {
      return;
    }
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await service.updateTicket(selectedTicket.id, {
        status: draft.status,
        priority: draft.priority,
        assignedToId: draft.assignedToId ? Number(draft.assignedToId) : undefined,
        clearAssignment: !draft.assignedToId,
        dueDate: draft.dueDate || undefined,
        resolution: draft.resolution
      });
      await load();
      setNotice(`Ticket #${selectedTicket.id} was updated successfully.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The ticket could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <section className={styles.state} aria-live="polite"><span aria-hidden="true" /><h2>Loading management dashboard</h2></section>;
  }

  if (error && !context) {
    return <section className={`${styles.state} ${styles.errorState}`} role="alert"><h2>Unable to load Support IT Management</h2><p>{error}</p><button onClick={() => { load().catch(() => undefined); }}>Try again</button></section>;
  }

  if (!context?.isAgent) {
    return (
      <section className={`${styles.state} ${styles.denied}`} role="alert">
        <strong aria-hidden="true">403</strong>
        <h2>Agent access required</h2>
        <p>This web part is reserved for members of the Support IT Agents SharePoint group.</p>
      </section>
    );
  }

  return (
    <main className={styles.management}>
      <header className={styles.header}>
        <div>
          <span>Agent workspace</span>
          <h1>Support IT Management</h1>
          <p>Prioritise, assign and resolve requests from one operational view.</p>
        </div>
        <button type="button" onClick={() => { load().catch(() => undefined); }} disabled={saving}>Refresh tickets</button>
      </header>

      <section className={styles.metrics} aria-label="Ticket overview">
        <div><span>All tickets</span><strong>{metrics.total}</strong></div>
        <div><span>Open</span><strong>{metrics.open}</strong></div>
        <div className={styles.criticalMetric}><span>Critical</span><strong>{metrics.critical}</strong></div>
        <div className={styles.unassignedMetric}><span>Unassigned</span><strong>{metrics.unassigned}</strong></div>
      </section>

      <section className={styles.agentView} aria-labelledby="agent-view-title">
        <div className={styles.agentViewHeading}>
          <div><span>Workload</span><h2 id="agent-view-title">View by assigned agent</h2></div>
          <p>Select an agent to filter the ticket queue.</p>
        </div>
        <div className={styles.agentCards}>
          <button
            className={agentFilter === 'all' ? styles.activeAgent : ''}
            onClick={() => setAgentFilter('all')}
            type="button"
          >
            <span className={styles.agentAvatar} aria-hidden="true">ALL</span>
            <span><strong>All agents</strong><small>{tickets.length} tickets</small></span>
          </button>
          {agentWorkload.map(agent => (
            <button
              className={agentFilter === agent.user.id ? styles.activeAgent : ''}
              key={agent.user.id}
              onClick={() => {
                setAgentFilter(agent.user.id);
                setAssignmentFilter('all');
              }}
              type="button"
            >
              <span className={styles.agentAvatar} aria-hidden="true">
                {agent.user.displayName.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}
              </span>
              <span><strong>{agent.user.displayName}</strong><small>{agent.open} open · {agent.total} total</small></span>
            </button>
          ))}
          <button
            className={agentFilter === 'unassigned' ? styles.activeAgent : ''}
            onClick={() => {
              setAgentFilter('unassigned');
              setAssignmentFilter('all');
            }}
            type="button"
          >
            <span className={`${styles.agentAvatar} ${styles.unassignedAvatar}`} aria-hidden="true">?</span>
            <span><strong>Unassigned</strong><small>{metrics.unassigned} open tickets</small></span>
          </button>
        </div>
      </section>

      {error && <div className={styles.alert} role="alert"><span>{error}</span><button onClick={() => setError(undefined)} aria-label="Dismiss error">×</button></div>}
      {notice && <div className={styles.notice} role="status">{notice}</div>}

      <section className={styles.filters} aria-label="Ticket filters">
        <label className={styles.search}>
          <span>Search tickets</span>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="ID, subject, requester or assignee" type="search" />
        </label>
        <label><span>Status</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value as TicketStatus | 'all')}><option value="all">All statuses</option>{ticketStatuses.map(status => <option key={status}>{status}</option>)}</select></label>
        <label><span>Priority</span><select value={priorityFilter} onChange={event => setPriorityFilter(event.target.value as TicketPriority | 'all')}><option value="all">All priorities</option>{ticketPriorities.map(priority => <option key={priority}>{priority}</option>)}</select></label>
        <label><span>Category</span><select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value as TicketCategory | 'all')}><option value="all">All categories</option>{ticketCategories.map(category => <option key={category}>{category}</option>)}</select></label>
        <label><span>Assignment</span><select value={assignmentFilter} onChange={event => {
          setAssignmentFilter(event.target.value as AssignmentFilter);
          setAgentFilter('all');
        }}><option value="all">All tickets</option><option value="assigned">Assigned</option><option value="unassigned">Unassigned</option></select></label>
      </section>

      <div className={styles.workspace}>
        <section className={styles.queue} aria-labelledby="queue-title">
          <div className={styles.panelHeading}>
            <h2 id="queue-title">Ticket queue</h2>
            <span>{filteredTickets.length} result{filteredTickets.length === 1 ? '' : 's'}</span>
          </div>
          {filteredTickets.length === 0 ? (
            <div className={styles.empty}><strong>No matching tickets</strong><p>Adjust the filters to widen the queue.</p></div>
          ) : (
            <div className={styles.ticketList}>
              {filteredTickets.map(ticket => (
                <button
                  className={ticket.id === selectedId ? styles.selected : ''}
                  key={ticket.id}
                  onClick={() => {
                    setSelectedId(ticket.id);
                    setNotice(undefined);
                  }}
                  type="button"
                >
                  <span className={styles.ticketTopline}><b>#{ticket.id}</b><em data-priority={ticket.priority}>{ticket.priority}</em></span>
                  <strong>{ticket.subject}</strong>
                  <span className={styles.ticketMeta}>{ticket.author.displayName} · {ticket.category}</span>
                  <span className={styles.ticketBottom}><span data-status={ticket.status}>{ticket.status}</span><time>{formatDate(ticket.modified)}</time></span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className={styles.editor} aria-labelledby="editor-title">
          {!selectedTicket || !draft ? (
            <div className={styles.empty}><strong>Select a ticket</strong><p>Choose a request from the queue to manage it.</p></div>
          ) : (
            <>
              <div className={styles.editorHeading}>
                <div><span>Ticket #{selectedTicket.id}</span><h2 id="editor-title">{selectedTicket.subject}</h2></div>
                <span data-status={selectedTicket.status}>{selectedTicket.status}</span>
              </div>
              <dl className={styles.ticketFacts}>
                <div><dt>Requester</dt><dd>{selectedTicket.author.displayName}<small>{selectedTicket.author.email}</small></dd></div>
                <div><dt>Created</dt><dd>{formatDate(selectedTicket.created)}</dd></div>
                <div><dt>Category</dt><dd>{selectedTicket.category}</dd></div>
                <div><dt>Attachments</dt><dd>{selectedTicket.attachmentCount}</dd></div>
              </dl>
              <div className={styles.description}><h3>Description</h3><p>{selectedTicket.description}</p></div>
              <form onSubmit={event => {
                event.preventDefault();
                save().catch(() => undefined);
              }}>
                <div className={styles.formGrid}>
                  <label><span>Status</span><select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as TicketStatus })}>{ticketStatuses.map(status => <option key={status}>{status}</option>)}</select></label>
                  <label><span>Priority</span><select value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value as TicketPriority })}>{ticketPriorities.map(priority => <option key={priority}>{priority}</option>)}</select></label>
                  <label><span>Assigned to</span><select value={draft.assignedToId} onChange={event => setDraft({ ...draft, assignedToId: event.target.value })}><option value="">Unassigned</option>{users.map(user => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select></label>
                  <label><span>Due date</span><input type="date" value={draft.dueDate} onChange={event => setDraft({ ...draft, dueDate: event.target.value })} /></label>
                </div>
                <label className={styles.resolution}><span>Resolution and agent notes</span><textarea rows={5} value={draft.resolution} onChange={event => setDraft({ ...draft, resolution: event.target.value })} placeholder="Document the diagnosis, action taken and outcome." /></label>
                <div className={styles.actions}>
                  <button type="button" onClick={() => setDraft(toDraft(selectedTicket))} disabled={saving}>Reset</button>
                  <button className={styles.saveButton} type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save ticket'}</button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
};

export default SupportItManagement;

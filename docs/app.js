const seedTickets = [
  { id: 1042, subject: 'VPN disconnects during meetings', description: 'The VPN drops after approximately twenty minutes when Teams is running.', category: 'Network', priority: 'High', status: 'In progress', requester: 'Alex Morgan', assignee: 'Noah Williams', modified: 'Today, 14:32', due: '2026-09-21', resolution: '' },
  { id: 1041, subject: 'Access to finance workspace', description: 'Please grant contributor access to the quarterly finance workspace.', category: 'Access', priority: 'Normal', status: 'Waiting', requester: 'Maya Patel', assignee: 'Olivia Martin', modified: 'Today, 11:08', due: '2026-09-23', resolution: 'Waiting for workspace owner approval.' },
  { id: 1040, subject: 'Laptop does not start', description: 'The device shows a black screen after the latest Windows update.', category: 'Hardware', priority: 'Critical', status: 'New', requester: 'Daniel Kim', assignee: '', modified: 'Today, 09:45', due: '2026-09-20', resolution: '' },
  { id: 1039, subject: 'Recover deleted OneDrive files', description: 'A project folder was deleted yesterday and needs to be restored.', category: 'Software', priority: 'High', status: 'Resolved', requester: 'Sofia Rossi', assignee: 'Emma Davis', modified: 'Yesterday', due: '2026-09-19', resolution: 'Folder restored from the second-stage recycle bin.' },
  { id: 1038, subject: 'New headset configuration', description: 'Configure a USB headset for Teams calls and validate audio quality.', category: 'Telephony', priority: 'Low', status: 'Closed', requester: 'Thomas Bernard', assignee: 'Lucas Wilson', modified: '18 Sep', due: '2026-09-18', resolution: 'Drivers updated and Teams audio test completed.' },
  { id: 1037, subject: 'Suspicious email reported', description: 'Received a message asking for Microsoft 365 credentials.', category: 'Access', priority: 'Critical', status: 'In progress', requester: 'Nora Jensen', assignee: 'Sophia Brown', modified: '18 Sep', due: '2026-09-19', resolution: 'Message quarantined; investigation in progress.' }
];

const resources = [
  ['Account', 'Reset your password', 'Recover access to your Microsoft 365 account securely.', 'https://passwordreset.microsoftonline.com/'],
  ['Collaboration', 'Microsoft Teams help', 'Guidance for meetings, chat, calls and collaboration.', 'https://support.microsoft.com/teams'],
  ['Email', 'Outlook support', 'Resolve common email, calendar and mailbox issues.', 'https://support.microsoft.com/outlook'],
  ['Files', 'OneDrive essentials', 'Sync, share and recover your work files.', 'https://support.microsoft.com/onedrive'],
  ['Security', 'Protect your account', 'Recognise phishing and keep your devices secure.', 'https://support.microsoft.com/security'],
  ['Self-service', 'Microsoft 365 help', 'Browse product documentation and troubleshooting guides.', 'https://support.microsoft.com/microsoft-365']
];

const faqs = [
  ['How quickly will Support IT respond?', 'Critical incidents are prioritised immediately. Normal requests are reviewed during business hours.'],
  ['What should I include in a ticket?', 'Describe what happened, any error message, the affected device or service, and the impact on your work.'],
  ['Can I follow the progress of my request?', 'Yes. Open All tickets to see status, assignment and due date for every sample request.'],
  ['When should I choose Critical priority?', 'Use Critical for widespread outages, security incidents or issues preventing essential work.']
];

const agents = ['Olivia Martin', 'Noah Williams', 'Emma Davis', 'Liam Anderson', 'Sophia Brown', 'Lucas Wilson'];
const statuses = ['New', 'In progress', 'Waiting', 'Resolved', 'Closed'];
const priorities = ['Low', 'Normal', 'High', 'Critical'];
const categories = ['Hardware', 'Software', 'Access', 'Network', 'Telephony', 'Other'];
const app = document.querySelector('#app');
let tickets = JSON.parse(localStorage.getItem('support-it-demo') || 'null') || structuredClone(seedTickets);
let view = 'dashboard';
let selectedId = tickets[0]?.id;
let agentFilter = 'all';

const saveTickets = () => localStorage.setItem('support-it-demo', JSON.stringify(tickets));
const openTickets = () => tickets.filter(ticket => !['Resolved', 'Closed'].includes(ticket.status));
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[character]);
const badge = ticket => `<span class="badge ${ticket.priority === 'Critical' ? 'critical' : ''}">${escapeHtml(ticket.status)}</span>`;

function renderDashboard() {
  const open = openTickets();
  const waiting = tickets.filter(ticket => ticket.status === 'Waiting').length;
  const resolved = tickets.filter(ticket => ['Resolved', 'Closed'].includes(ticket.status)).length;
  const critical = open.filter(ticket => ticket.priority === 'Critical').length;
  app.innerHTML = `
    <section>
      <div class="section-heading"><div><span class="eyebrow">Overview</span><h2>Your requests at a glance</h2></div><button class="primary" data-go="create">+ Create a ticket</button></div>
      <div class="summary-grid">
        <article class="summary-card"><span>Open tickets</span><strong>${open.length}</strong><small>Needs attention</small></article>
        <article class="summary-card"><span>Waiting</span><strong>${waiting}</strong><small>Action required</small></article>
        <article class="summary-card"><span>Resolved</span><strong>${resolved}</strong><small>Requests completed</small></article>
        <article class="summary-card"><span>Critical</span><strong>${critical}</strong><small>Immediate priority</small></article>
      </div>
    </section>
    <section class="panel"><div class="section-heading"><div><span class="eyebrow">Recent activity</span><h2>Latest tickets</h2></div><button class="primary" data-go="tickets">View all</button></div><div class="recent-list">${tickets.slice(0, 4).map(ticketRow).join('')}</div></section>
    <section class="panel"><div class="section-heading"><div><span class="eyebrow">Self-service</span><h2>Useful resources</h2></div></div><div class="resource-grid">${resources.map(resource => `<a class="resource-card" href="${resource[3]}" target="_blank" rel="noreferrer"><span>${resource[0]}</span><strong>${resource[1]} ↗</strong><p>${resource[2]}</p></a>`).join('')}</div></section>
    <section class="panel faq"><div class="section-heading"><div><span class="eyebrow">Good to know</span><h2>Frequently asked questions</h2></div></div>${faqs.map(item => `<details><summary>${item[0]}</summary><p>${item[1]}</p></details>`).join('')}</section>`;
}

function ticketRow(ticket) {
  return `<button class="ticket-row" data-ticket="${Number(ticket.id)}"><span class="ticket-id">#${Number(ticket.id)}</span><strong>${escapeHtml(ticket.subject)}</strong>${badge(ticket)}<span>${escapeHtml(ticket.modified)}</span></button>`;
}

function renderCreate() {
  app.innerHTML = `<section class="form-panel"><span class="eyebrow">New request</span><h2>Create a ticket</h2><p>Tell us what you need. This demo stores the ticket only in your browser.</p>
    <form id="ticket-form">
      <label class="field">Subject<input name="subject" required maxlength="120" placeholder="What can we help you with?"></label>
      <label class="field">Description<textarea name="description" rows="7" required placeholder="Context, error message, impact…"></textarea></label>
      <div class="form-grid">
        <label>Category<select name="category">${categories.map(value => `<option>${value}</option>`).join('')}</select></label>
        <label>Priority<select name="priority">${priorities.map(value => `<option ${value === 'Normal' ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
      </div>
      <div class="actions"><button class="primary" type="submit">Submit demo ticket</button></div>
    </form></section>`;
  document.querySelector('#ticket-form').addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const newTicket = {
      id: Math.max(...tickets.map(ticket => ticket.id), 1000) + 1,
      subject: data.get('subject'),
      description: data.get('description'),
      category: data.get('category'),
      priority: data.get('priority'),
      status: 'New',
      requester: 'Laurent Anciaux',
      assignee: '',
      modified: 'Just now',
      due: '',
      resolution: ''
    };
    tickets.unshift(newTicket);
    selectedId = newTicket.id;
    saveTickets();
    view = 'tickets';
    render();
  });
}

function renderTickets() {
  app.innerHTML = `<section><div class="section-heading"><div><span class="eyebrow">Requests</span><h2>All demo tickets</h2></div><button class="primary" data-go="create">+ Create a ticket</button></div><div class="ticket-grid">${tickets.map(ticket => `<article class="ticket-card"><span class="ticket-id">#${Number(ticket.id)} · ${escapeHtml(ticket.category)}</span><h3>${escapeHtml(ticket.subject)}</h3><p>${escapeHtml(ticket.description)}</p><footer>${badge(ticket)}<span>${escapeHtml(ticket.assignee || 'Unassigned')}</span></footer></article>`).join('')}</div></section>`;
}

function renderManagement() {
  const assignedAgents = agents.filter(agent => tickets.some(ticket => ticket.assignee === agent));
  const visible = agentFilter === 'all' ? tickets : tickets.filter(ticket => agentFilter === 'unassigned' ? !ticket.assignee : ticket.assignee === agentFilter);
  if (!visible.some(ticket => ticket.id === selectedId)) selectedId = visible[0]?.id;
  const selected = tickets.find(ticket => ticket.id === selectedId);
  const agentButton = (label, value, count, initials) => `<button class="agent-filter ${agentFilter === value ? 'active' : ''}" data-agent="${value}"><span class="avatar">${initials}</span><span><strong>${label}</strong><small>${count} tickets</small></span></button>`;
  app.innerHTML = `<section>
    <div class="section-heading"><div><span class="eyebrow">Agent workspace</span><h2>Ticket management</h2></div></div>
    <div class="summary-grid">
      <article class="summary-card"><span>All tickets</span><strong>${tickets.length}</strong></article>
      <article class="summary-card"><span>Open</span><strong>${openTickets().length}</strong></article>
      <article class="summary-card"><span>Resolved</span><strong>${tickets.filter(t => ['Resolved','Closed'].includes(t.status)).length}</strong></article>
      <article class="summary-card"><span>Unassigned</span><strong>${tickets.filter(t => !t.assignee).length}</strong></article>
    </div>
    <div class="agent-strip">
      ${agentButton('All agents', 'all', tickets.length, 'ALL')}
      ${assignedAgents.map(agent => agentButton(agent, agent, tickets.filter(ticket => ticket.assignee === agent).length, agent.split(' ').map(part => part[0]).join(''))).join('')}
      ${agentButton('Unassigned', 'unassigned', tickets.filter(ticket => !ticket.assignee).length, '?')}
    </div>
    <div class="management-grid">
      <div class="queue">${visible.length ? visible.map(ticketRow).join('') : '<div class="empty">No tickets for this agent.</div>'}</div>
      <div class="editor">${selected ? managementEditor(selected) : '<div class="empty">Select a ticket to manage it.</div>'}</div>
    </div>
  </section>`;
  bindManagement();
}

function managementEditor(ticket) {
  return `<span class="ticket-id">Ticket #${Number(ticket.id)}</span><h2>${escapeHtml(ticket.subject)}</h2><p><strong>Requester:</strong> ${escapeHtml(ticket.requester)}</p><p class="description">${escapeHtml(ticket.description)}</p>
    <form id="management-form">
      <div class="form-grid">
        <label>Status<select name="status">${statuses.map(value => `<option ${value === ticket.status ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
        <label>Priority<select name="priority">${priorities.map(value => `<option ${value === ticket.priority ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
        <label>Assigned to<select name="assignee"><option value="">Unassigned</option>${agents.map(value => `<option ${value === ticket.assignee ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
        <label>Due date<input name="due" type="date" value="${escapeHtml(ticket.due || '')}"></label>
      </div>
      <label class="field">Resolution and notes<textarea name="resolution" rows="5">${escapeHtml(ticket.resolution || '')}</textarea></label>
      <div class="actions"><button class="primary" type="submit">Save ticket</button></div>
    </form>`;
}

function bindManagement() {
  document.querySelectorAll('[data-agent]').forEach(button => button.addEventListener('click', () => {
    agentFilter = button.dataset.agent;
    renderManagement();
  }));
  document.querySelector('#management-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const ticket = tickets.find(item => item.id === selectedId);
    ticket.status = data.get('status');
    ticket.priority = data.get('priority');
    ticket.assignee = data.get('assignee');
    ticket.due = data.get('due');
    ticket.resolution = data.get('resolution');
    ticket.modified = 'Just now';
    saveTickets();
    renderManagement();
    document.querySelector('.management-grid').insertAdjacentHTML('beforebegin', '<div class="notice">Ticket updated in this browser demo.</div>');
  });
}

function bindCommon() {
  document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => {
    view = button.dataset.go;
    render();
    window.scrollTo({ top: document.querySelector('.main-nav').offsetTop, behavior: 'smooth' });
  }));
  document.querySelectorAll('[data-ticket]').forEach(button => button.addEventListener('click', () => {
    selectedId = Number(button.dataset.ticket);
    view = 'management';
    render();
  }));
}

function render() {
  document.querySelectorAll('.main-nav button').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  if (view === 'create') renderCreate();
  else if (view === 'tickets') renderTickets();
  else if (view === 'management') renderManagement();
  else renderDashboard();
  bindCommon();
  app.focus({ preventScroll: true });
}

document.querySelectorAll('.main-nav button').forEach(button => button.addEventListener('click', () => {
  view = button.dataset.view;
  render();
}));

document.querySelector('#reset-demo').addEventListener('click', () => {
  localStorage.removeItem('support-it-demo');
  tickets = structuredClone(seedTickets);
  view = 'dashboard';
  agentFilter = 'all';
  render();
});

render();

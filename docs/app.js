const seedTickets = [
  { id: 1042, subject: 'VPN disconnects during meetings', description: 'The VPN drops after approximately twenty minutes when Teams is running.', category: 'Network', priority: 'High', status: 'In progress', requester: 'Demo requester A', assignee: 'Demo agent 2', modified: 'Today, 14:32', due: '2026-09-21', resolution: '' },
  { id: 1041, subject: 'Access to finance workspace', description: 'Please grant contributor access to the quarterly finance workspace.', category: 'Access', priority: 'Normal', status: 'Waiting', requester: 'Demo requester B', assignee: 'Demo agent 1', modified: 'Today, 11:08', due: '2026-09-23', resolution: 'Waiting for workspace owner approval.' },
  { id: 1040, subject: 'Laptop does not start', description: 'The device shows a black screen after the latest Windows update.', category: 'Hardware', priority: 'Critical', status: 'New', requester: 'Demo requester C', assignee: '', modified: 'Today, 09:45', due: '2026-09-20', resolution: '' },
  { id: 1039, subject: 'Recover deleted OneDrive files', description: 'A project folder was deleted yesterday and needs to be restored.', category: 'Software', priority: 'High', status: 'Resolved', requester: 'Demo requester D', assignee: 'Demo agent 3', modified: 'Yesterday', due: '2026-09-19', resolution: 'Folder restored from the second-stage recycle bin.' },
  { id: 1038, subject: 'New headset configuration', description: 'Configure a USB headset for Teams calls and validate audio quality.', category: 'Telephony', priority: 'Low', status: 'Closed', requester: 'Demo requester E', assignee: 'Demo agent 6', modified: '18 Sep', due: '2026-09-18', resolution: 'Drivers updated and Teams audio test completed.' },
  { id: 1037, subject: 'Suspicious email reported', description: 'Received a message asking for Microsoft 365 credentials.', category: 'Access', priority: 'Critical', status: 'In progress', requester: 'Demo requester F', assignee: 'Demo agent 5', modified: '18 Sep', due: '2026-09-19', resolution: 'Message quarantined; investigation in progress.' }
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

const agents = ['Demo agent 1', 'Demo agent 2', 'Demo agent 3', 'Demo agent 4', 'Demo agent 5', 'Demo agent 6'];
const statuses = ['New', 'In progress', 'Waiting', 'Resolved', 'Closed'];
const priorities = ['Low', 'Normal', 'High', 'Critical'];
const categories = ['Hardware', 'Software', 'Access', 'Network', 'Telephony', 'Other'];
const kiwiIntakeFormUrl = 'https://europarl.sharepoint.com/:l:/s/learn.IT-Kiwi/JAAt_nP2M5fdRpr-S_YUyZICAaohrMu1P2lFpVhNeblaX-k?nav=Nzk3NjUwYjUtNmViMi00YzE1LTlhM2EtMDg4MzY3ZjlmZDBh';
const kiwiTicketListUrl = 'https://europarl.sharepoint.com/sites/learn.IT-Kiwi/Lists/EuropaTickets/AllItems.aspx';
const kiwiTicketExchangeListUrl = 'https://europarl.sharepoint.com/sites/learn.IT-Kiwi/Lists/TicketExchanges/AllItems.aspx';
const app = document.querySelector('#app');
const dialog = document.querySelector('#ticket-dialog');
const dialogBody = document.querySelector('#dialog-body');
const isDemo = new URLSearchParams(window.location.search).get('demo') === '1';
let intakePopup;
let popupUrl;
let tickets = isDemo ? JSON.parse(localStorage.getItem('support-it-demo') || 'null') || structuredClone(seedTickets) : [];
let view = new URLSearchParams(window.location.search).get('action') === 'create' ? 'create' : 'dashboard';
let selectedId = tickets[0]?.id;
let agentFilter = 'all';
let ticketFilter = 'all';
let dataLoading = !isDemo;
let dataError = '';
let signInRequired = false;
let loadVersion = 0;

const saveTickets = () => {
  if (!isDemo) throw new Error('Live ticket changes must be made in authenticated SharePoint.');
  localStorage.setItem('support-it-demo', JSON.stringify(tickets));
};
const openTickets = () => tickets.filter(ticket => !['Resolved', 'Closed'].includes(ticket.status));
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[character]);
const badge = ticket => `<span class="badge ${ticket.priority === 'Critical' ? 'critical' : ''}">${escapeHtml(ticket.status)}</span>`;

function showLiveToolStatus(label) {
  const status = document.querySelector('#intake-status');
  status.hidden = false;
  status.textContent = `The ${label} is open in a small window. Live actions require your Microsoft account and existing SharePoint permissions.${isDemo ? ' The tickets shown on this page remain browser-only samples.' : ' Refresh the workspace after completing your changes in SharePoint.'}`;
}

function openLiveTool(url = kiwiIntakeFormUrl, label = 'secure Kiwi form') {
  if (intakePopup && !intakePopup.closed) {
    if (popupUrl !== url) {
      intakePopup.location.replace(url);
      popupUrl = url;
    }
    intakePopup.focus();
    showLiveToolStatus(label);
    return;
  }
  intakePopup = window.open('about:blank', 'kiwi-ticket-form', 'popup,width=520,height=720,resizable=yes,scrollbars=yes');
  if (intakePopup) {
    // Remove access to the ticketing page before navigating to the authenticated form.
    intakePopup.opener = null;
    intakePopup.location.replace(url);
    popupUrl = url;
    showLiveToolStatus(label);
  } else {
    document.querySelector('#dialog-title').textContent = 'Kiwi window blocked';
    dialogBody.innerHTML = `<p role="alert">Your browser blocked the popup. Allow popups for this site and try again, or use the secure link below.</p><p>This live SharePoint tool requires your Microsoft account and existing permissions. Your ticketing page stays open.${isDemo ? ' Sample tickets on this public page are not connected to SharePoint.' : ''}</p><div class="actions"><button id="retry-popup" class="secondary" type="button">Try popup again</button><a class="primary live-form-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Open ${escapeHtml(label)}</a></div>`;
    dialog.showModal();
    document.querySelector('#retry-popup').addEventListener('click', () => {
      dialog.close();
      openLiveTool(url, label);
    });
  }
}

function liveToolLinks() {
  return `<a class="secondary live-form-link" data-live-tool="Kiwi agent queue" href="${kiwiTicketListUrl}" target="_blank" rel="noreferrer">Open Kiwi agent queue ↗</a><a class="secondary live-form-link" data-live-tool="reply exchanges" href="${kiwiTicketExchangeListUrl}" target="_blank" rel="noreferrer">Open reply exchanges ↗</a>`;
}

function renderCreateLanding() {
  app.innerHTML = `<section class="form-panel"><span class="eyebrow">Kiwi intake</span><h2>Create a ticket</h2><p>The official Microsoft Lists form supports attachments and the existing Kiwi SharePoint/Teams workflow. Sign in with your Microsoft account in the popup.${isDemo ? ' This demonstration does not read private tenant data.' : ' Ticket tracking requires separately authorized agent access.'}</p><p><a class="primary live-form-link" data-live-tool="secure Kiwi form" href="${kiwiIntakeFormUrl}" target="_blank" rel="noreferrer">Open the secure Kiwi form ↗</a></p><p>Submit in the native form before closing it. Switching between live tools reuses the window and may discard unsaved form changes.</p>${isDemo ? '<button class="secondary" data-sample-form type="button" aria-haspopup="dialog">Try sample form (browser only)</button>' : ''}</section>`;
}

function renderDashboard() {
  const open = openTickets();
  const waiting = tickets.filter(ticket => ticket.status === 'Waiting').length;
  const resolved = tickets.filter(ticket => ['Resolved', 'Closed'].includes(ticket.status)).length;
  const critical = open.filter(ticket => ticket.priority === 'Critical').length;
  app.innerHTML = `
    <section>
      <div class="section-heading"><div><span class="eyebrow">Overview</span><h2>Your requests at a glance</h2></div><button class="primary" data-go="create">+ Create a ticket</button></div>
      <div class="summary-grid">
        <button class="summary-card" data-ticket-filter="open" type="button"><span>Open tickets</span><strong>${open.length}</strong><small>Needs attention</small></button>
        <button class="summary-card" data-ticket-filter="waiting" type="button"><span>Waiting</span><strong>${waiting}</strong><small>Action required</small></button>
        <button class="summary-card" data-ticket-filter="resolved" type="button"><span>Resolved</span><strong>${resolved}</strong><small>Requests completed</small></button>
        <button class="summary-card" data-ticket-filter="critical" type="button"><span>Critical</span><strong>${critical}</strong><small>Immediate priority</small></button>
      </div>
    </section>
    <section class="panel"><div class="section-heading"><div><span class="eyebrow">Recent activity</span><h2>Latest tickets</h2></div><button class="primary" data-go="tickets">View all</button></div><div class="recent-list">${tickets.slice(0, 4).map(ticket => ticketRow(ticket, true)).join('')}</div></section>
    <section class="panel"><div class="section-heading"><div><span class="eyebrow">Self-service</span><h2>Useful resources</h2></div></div><div class="resource-grid">${resources.map(resource => `<a class="resource-card" href="${resource[3]}" target="_blank" rel="noreferrer"><span>${resource[0]}</span><strong>${resource[1]} ↗</strong><p>${resource[2]}</p></a>`).join('')}</div></section>
    <section class="panel faq"><div class="section-heading"><div><span class="eyebrow">Good to know</span><h2>Frequently asked questions</h2></div></div>${faqs.map(item => `<details><summary>${item[0]}</summary><p>${!isDemo && item[0] === 'Can I follow the progress of my request?' ? 'Authorized learn.IT support agents can track requests in All tickets. Other requesters use the native Kiwi form and existing SharePoint communications.' : item[1]}</p></details>`).join('')}</section>`;
}

function ticketRow(ticket, opensList = false) {
  const attribute = opensList ? 'data-ticket-list' : 'data-ticket';
  return `<button class="ticket-row" ${attribute}="${Number(ticket.id)}"><span class="ticket-id">#${Number(ticket.id)}</span><strong>${escapeHtml(ticket.subject)}</strong>${badge(ticket)}<span>${escapeHtml(ticket.modified)}</span></button>`;
}

function renderCreate() {
  if (!isDemo) return;
  document.querySelector('#dialog-title').textContent = 'Try the sample workflow';
  dialogBody.innerHTML = `<section><span class="eyebrow">Browser-only demo</span><p>This sample form stores data only in this browser. For a real request use Create a ticket.</p>
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
      requester: 'Demo requester',
      assignee: '',
      modified: 'Just now',
      due: '',
      resolution: ''
    };
    tickets.unshift(newTicket);
    selectedId = newTicket.id;
    saveTickets();
    view = 'tickets';
    ticketFilter = 'all';
    dialog.close();
    render();
  });
  dialog.showModal();
}

function renderTickets() {
  const filters = {
    all: [isDemo ? 'All demo tickets' : 'All tickets', () => true],
    open: ['Open tickets', ticket => !['Resolved', 'Closed'].includes(ticket.status)],
    waiting: ['Waiting tickets', ticket => ticket.status === 'Waiting'],
    resolved: ['Resolved tickets', ticket => ['Resolved', 'Closed'].includes(ticket.status)],
    critical: ['Critical open tickets', ticket => ticket.priority === 'Critical' && !['Resolved', 'Closed'].includes(ticket.status)]
  };
  const exactId = ticketFilter.startsWith('ticket:') ? Number(ticketFilter.split(':')[1]) : undefined;
  const [title, predicate] = exactId
    ? ['Selected ticket', ticket => ticket.id === exactId]
    : (filters[ticketFilter] || filters.all);
  const visibleTickets = tickets.filter(predicate);
  app.innerHTML = `<section><div class="section-heading"><div><span class="eyebrow">${isDemo ? 'Sample requests' : 'Agent requests'}</span><h2>${title}</h2><p>${isDemo ? 'This list contains browser-only demo data.' : 'Authorized SharePoint ticket data. Open a ticket for full details; make changes in the native Kiwi queue.'} Live links require existing SharePoint permissions. Switching live tools may discard unsaved form changes.</p></div><div class="actions">${ticketFilter !== 'all' ? '<button class="secondary" data-ticket-filter="all" type="button">View all tickets</button>' : ''}${liveToolLinks()}<button class="primary" data-go="create">+ Create a ticket</button></div></div><div class="ticket-grid">${visibleTickets.length ? visibleTickets.map(ticket => `<article class="ticket-card"><span class="ticket-id">#${Number(ticket.id)} · ${escapeHtml(ticket.category)}</span><h3>${escapeHtml(ticket.subject)}</h3><p>${escapeHtml(ticket.description)}</p><footer>${badge(ticket)}<span>${escapeHtml(ticket.assignee || 'Unassigned')}</span></footer>${isDemo ? '' : `<button class="secondary" data-ticket-detail="${Number(ticket.id)}" type="button">Open details</button>`}</article>`).join('') : '<div class="empty">No tickets match this selection.</div>'}</div></section>`;
}

function renderManagement() {
  const assignedAgents = [...new Set(tickets.map(ticket => ticket.assignee).filter(Boolean))];
  const visible = agentFilter === 'all' ? tickets : tickets.filter(ticket => agentFilter === 'unassigned' ? !ticket.assignee : ticket.assignee === agentFilter);
  if (!visible.some(ticket => ticket.id === selectedId)) selectedId = visible[0]?.id;
  const selected = tickets.find(ticket => ticket.id === selectedId);
  const agentButton = (label, value, count, initials) => `<button class="agent-filter ${agentFilter === value ? 'active' : ''}" data-agent="${escapeHtml(value)}"><span class="avatar">${escapeHtml(initials)}</span><span><strong>${escapeHtml(label)}</strong><small>${count} tickets</small></span></button>`;
  app.innerHTML = `<section>
    <div class="section-heading"><div><span class="eyebrow">${isDemo ? 'Sample agent workspace' : 'Agent workspace'}</span><h2>Ticket management</h2><p>${isDemo ? 'Edits below are browser-only samples.' : 'Read-only tracking. Make changes in the authenticated Kiwi queue.'} Live links require existing SharePoint permissions. Switching live tools may discard unsaved form changes.</p></div><div class="actions">${liveToolLinks()}</div></div>
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
      <div class="queue">${visible.length ? visible.map(ticket => ticketRow(ticket)).join('') : '<div class="empty">No tickets for this agent.</div>'}</div>
      <div class="editor">${selected ? managementEditor(selected) : '<div class="empty">Select a ticket to manage it.</div>'}</div>
    </div>
  </section>`;
  bindManagement();
}

function managementEditor(ticket) {
  if (!isDemo) return ticketDetails(ticket);
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

function ticketDetails(ticket) {
  return `<span class="ticket-id">Ticket #${Number(ticket.id)}</span><h2>${escapeHtml(ticket.subject)}</h2><p><strong>Requester:</strong> ${escapeHtml(ticket.requester)}</p><p class="description">${escapeHtml(ticket.description)}</p><p><strong>Category:</strong> ${escapeHtml(ticket.category)}</p><p><strong>Status:</strong> ${escapeHtml(ticket.status)}</p><p><strong>Priority:</strong> ${escapeHtml(ticket.priority)}</p><p><strong>Assigned to:</strong> ${escapeHtml(ticket.assignee || 'Unassigned')}</p><p><strong>Due date:</strong> ${escapeHtml(ticket.due || 'Not set')}</p><p><strong>Modified:</strong> ${escapeHtml(ticket.modified)}</p><p><strong>Resolution and notes:</strong> ${escapeHtml(ticket.resolution)}</p><p><strong>Attachments:</strong> ${Number(ticket.attachmentCount)} (open in the authenticated Kiwi queue)</p>`;
}

function bindManagement() {
  bindLiveTools();
  document.querySelectorAll('[data-agent]').forEach(button => button.addEventListener('click', () => {
    agentFilter = button.dataset.agent;
    renderManagement();
    bindCommon();
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
    bindCommon();
    document.querySelector('.management-grid').insertAdjacentHTML('beforebegin', '<div class="notice">Ticket updated in this browser demo.</div>');
  });
}

function bindLiveTools() {
  document.querySelectorAll('[data-live-tool]').forEach(link => {
    link.onclick = event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openLiveTool(link.href, link.dataset.liveTool);
    };
  });
}

function bindCommon() {
  bindLiveTools();
  document.querySelectorAll('[data-sample-form]').forEach(button => button.addEventListener('click', renderCreate));
  document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.go === 'create') {
      openLiveTool();
      return;
    }
    if (button.dataset.go === 'tickets') ticketFilter = 'all';
    view = button.dataset.go;
    render();
    window.scrollTo({ top: document.querySelector('.main-nav').offsetTop, behavior: 'smooth' });
  }));
  document.querySelectorAll('[data-ticket-filter]').forEach(button => button.addEventListener('click', () => {
    ticketFilter = button.dataset.ticketFilter;
    view = 'tickets';
    render();
    window.scrollTo({ top: document.querySelector('.main-nav').offsetTop, behavior: 'smooth' });
  }));
  document.querySelectorAll('[data-ticket-list]').forEach(button => button.addEventListener('click', () => {
    ticketFilter = `ticket:${Number(button.dataset.ticketList)}`;
    view = 'tickets';
    render();
    window.scrollTo({ top: document.querySelector('.main-nav').offsetTop, behavior: 'smooth' });
  }));
  document.querySelectorAll('[data-ticket]').forEach(button => button.addEventListener('click', () => {
    selectedId = Number(button.dataset.ticket);
    view = 'management';
    render();
  }));
  document.querySelectorAll('[data-ticket-detail]').forEach(button => button.addEventListener('click', () => {
    const ticket = tickets.find(item => item.id === Number(button.dataset.ticketDetail));
    document.querySelector('#dialog-title').textContent = `Ticket #${ticket.id}`;
    dialogBody.innerHTML = ticketDetails(ticket);
    dialog.showModal();
  }));
  document.querySelector('[data-refresh]')?.addEventListener('click', loadLiveTickets);
}

function render() {
  document.querySelectorAll('.main-nav button').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  if (view === 'create') renderCreateLanding();
  else if (!isDemo && (dataLoading || dataError || signInRequired)) {
    app.innerHTML = `<section class="form-panel"><span class="eyebrow">Authorized agents only</span><h2>${dataLoading ? 'Loading tickets' : signInRequired ? 'Microsoft sign-in required' : 'Live tracking unavailable'}</h2><p role="${dataError ? 'alert' : 'status'}">${dataLoading ? 'Checking access to the protected ticket workspace.' : signInRequired ? 'Sign in with your institutional Microsoft account. Membership and SharePoint permissions must be verified by the protected service before any ticket data is returned.' : escapeHtml(dataError)}</p><div class="actions">${signInRequired ? `<a class="primary live-form-link" href="${window.KiwiTicketData.signInUrl}">Sign in with Microsoft</a>` : ''}${!dataLoading ? '<button class="secondary" data-refresh type="button">Retry</button>' : ''}${liveToolLinks()}</div></section>`;
  }
  else if (view === 'tickets') renderTickets();
  else if (view === 'management') renderManagement();
  else renderDashboard();
  bindCommon();
  app.focus({ preventScroll: true });
}

document.querySelectorAll('.main-nav button').forEach(button => button.addEventListener('click', () => {
  if (button.hasAttribute('data-demo-create')) {
    renderCreate();
    return;
  }
  if (button.dataset.view === 'create') {
    openLiveTool();
    return;
  }
  if (button.dataset.view === 'tickets') ticketFilter = 'all';
  view = button.dataset.view;
  render();
}));

document.querySelector('#close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { dialogBody.innerHTML = ''; });

document.querySelector('#reset-demo').addEventListener('click', () => {
  if (!isDemo) {
    loadLiveTickets();
    return;
  }
  localStorage.removeItem('support-it-demo');
  tickets = structuredClone(seedTickets);
  view = 'dashboard';
  agentFilter = 'all';
  ticketFilter = 'all';
  render();
});

async function loadLiveTickets() {
  const version = ++loadVersion;
  tickets = [];
  selectedId = undefined;
  dialog.close();
  dataLoading = true;
  dataError = '';
  signInRequired = false;
  render();
  try {
    if (!window.KiwiTicketData) throw new Error('The protected ticket adapter is unavailable. No ticket data has been loaded.');
    const result = await window.KiwiTicketData.load();
    if (version !== loadVersion) return;
    tickets = result.tickets;
    signInRequired = result.signInRequired;
  } catch (error) {
    if (version === loadVersion) dataError = error instanceof Error ? error.message : 'Unable to load the protected ticket workspace.';
  } finally {
    if (version === loadVersion) {
      dataLoading = false;
      render();
    }
  }
}

if (!isDemo) {
  document.querySelector('[data-demo-create]').hidden = true;
  document.querySelector('.footer-intro').hidden = true;
  document.querySelector('.team').hidden = true;
  document.querySelector('.footer-bottom span').textContent = 'European Parliament · Support IT';
  document.querySelector('.footer-bottom span:nth-child(2)').textContent = 'Ticket tracking requires Microsoft sign-in and authorized support-agent access.';
  document.querySelector('#reset-demo').textContent = 'Refresh tickets';
}

render();
if (!isDemo) loadLiveTickets();

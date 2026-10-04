(() => {
  const SITE_ROOT = "https://europarl.sharepoint.com/sites/learn.IT-Kiwi/";
  const TICKETS_ROOT = new URL("Lists/EuropaTickets/", SITE_ROOT);
  const CREATE_URL = new URL("NewForm.aspx", TICKETS_ROOT);
  CREATE_URL.searchParams.set("Source", new URL("/ticket-sent.html", window.location.origin).href);
  const LIST_URL = new URL("AllItems.aspx", TICKETS_ROOT).href;
  const AGENTS_URL = new URL("_layouts/15/people.aspx?MembershipGroupId=5", SITE_ROOT).href;

  function setStatus(message) {
    let status = document.querySelector("#sharepoint-ticket-status");
    if (!status) {
      status = document.createElement("p");
      status.id = "sharepoint-ticket-status";
      status.className = "notice";
      status.setAttribute("role", "status");
      document.querySelector(".main-nav")?.after(status);
    }
    if (status.textContent !== message) status.textContent = message;
  }

  function openSharePoint(url, name, message) {
    const popup = window.open(url, name, "popup=yes,width=760,height=860,resizable=yes,scrollbars=yes");
    if (!popup) {
      setStatus("Your browser blocked the secure SharePoint window. Allow pop-ups and try again.");
      return;
    }
    popup.focus();
    setStatus(message);
  }

  function setText(element, text) {
    if (element && element.textContent !== text) element.textContent = text;
  }

  function syncDashboard() {
    const app = document.querySelector("#app");
    const dashboard = document.querySelector('.main-nav [data-view="dashboard"]');
    if (!app || !dashboard?.classList.contains("active") || app.querySelector("#sharepoint-ticket-source")) return;
    app.innerHTML = `
      <section id="sharepoint-ticket-source" class="panel">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Microsoft 365</span>
            <h2>Your SharePoint tickets</h2>
          </div>
        </div>
        <p>Your live ticket list is stored securely in EuropaTickets. Sign in with your Microsoft 365 account to see only the tickets you are allowed to access.</p>
        <div class="actions">
          <button class="primary" data-go="tickets" type="button">View my tickets</button>
          <button class="secondary" data-go="create" type="button">Create a ticket</button>
        </div>
      </section>
    `;
  }


  let agentsLoaded = false;

  function initials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  }

  async function syncAgents() {
    const footer = document.querySelector(".team-footer");
    if (!footer || agentsLoaded) return;
    agentsLoaded = true;

    let team = footer.querySelector(".team");
    if (!team) {
      team = document.createElement("ul");
      team.className = "team";
      footer.querySelector(".footer-bottom")?.before(team);
    }
    team.hidden = false;

    try {
      const response = await fetch("./agents.json?v=20261004-1", { cache: "no-store" });
      if (!response.ok) throw new Error("Agent list unavailable");
      const data = await response.json();
      const names = [...new Set((Array.isArray(data.agents) ? data.agents : [])
        .map(agent => typeof agent?.name === "string" ? agent.name.trim() : "")
        .filter(Boolean))].slice(0, 100);
      if (!names.length) throw new Error("No authorised agents");

      team.replaceChildren(...names.map(name => {
        const item = document.createElement("li");
        const avatar = document.createElement("b");
        avatar.className = "white";
        avatar.textContent = initials(name);
        const details = document.createElement("span");
        const label = document.createElement("strong");
        label.textContent = name;
        details.append(label);
        item.append(avatar, details);
        return item;
      }));
    } catch {
      const item = document.createElement("li");
      item.textContent = "The authorised agent list is temporarily unavailable.";
      team.replaceChildren(item);
    }
  }

  function syncInterface() {
    syncDashboard();
    syncAgents();
    setText(document.querySelector('.main-nav [data-view="create"]'), "Create a ticket");
    setText(document.querySelector('.main-nav [data-view="tickets"]'), "View my tickets");
    setText(document.querySelector('.main-nav [data-view="management"]'), "Authorised agents");
    document.querySelectorAll('[data-go="tickets"]').forEach(button => setText(button, "View my tickets"));

    const footer = document.querySelector(".team-footer");
    if (footer) {
      setText(footer.querySelector(".footer-intro span"), "Authorised agents");
      setText(footer.querySelector(".footer-intro h2"), "SharePoint support group");
      setText(footer.querySelector(".footer-intro p"), "Agents are managed in the learn.IT-Kiwi Members SharePoint group.");
      const reset = footer.querySelector("#reset-demo");
      if (reset && !reset.hidden) reset.hidden = true;
    }
  }

  document.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    const action = event.target.closest('[data-view="create"], [data-go="create"], [data-view="tickets"], [data-go="tickets"], [data-view="management"], [data-ticket-list], [data-ticket]');
    if (!action) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const isCreate = action.matches('[data-view="create"], [data-go="create"]');
    const isAgents = action.matches('[data-view="management"]');
    if (isAgents) {
      syncAgents();
      document.querySelector(".team-footer")?.scrollIntoView({ behavior: "smooth" });
      setStatus("The authorised SharePoint agent list is shown below.");
      return;
    }
    openSharePoint(
      isCreate ? CREATE_URL.href : LIST_URL,
      isCreate ? "kiwi-ticket-form" : "kiwi-ticket-list",
      isCreate
        ? "The secure Microsoft 365 ticket form is open."
        : "Your secure SharePoint ticket list is open."
    );
  }, true);

  window.addEventListener("message", event => {
    if (event.origin !== window.location.origin || event.data?.type !== "kiwi-ticket-created") return;
    setStatus("Your ticket was submitted successfully.");
    window.focus();
  });

  const observer = new MutationObserver(syncInterface);
  observer.observe(document.querySelector("#app"), { childList: true, subtree: true });
  syncInterface();

  const requestedAction = new URL(window.location.href).searchParams.get("action");
  const requestedButton = requestedAction === "create"
    ? document.querySelector('.main-nav [data-view="create"]')
    : requestedAction === "tickets"
      ? document.querySelector('.main-nav [data-view="tickets"]')
      : null;
  if (requestedButton) {
    requestedButton.focus();
    setStatus(requestedAction === "create"
      ? "Select Create a ticket to open the secure Microsoft 365 form."
      : "Select View my tickets to open your secure SharePoint list.");
    window.history.replaceState({}, "", window.location.pathname);
  } else {
    setStatus("Create and manage your tickets securely with your Microsoft 365 account.");
  }
})();(() => {
  const SITE_ROOT = "https://europarl.sharepoint.com/sites/learn.IT-Kiwi/";
  const TICKETS_ROOT = new URL("Lists/EuropaTickets/", SITE_ROOT);
  const CREATE_URL = new URL("NewForm.aspx", TICKETS_ROOT);
  CREATE_URL.searchParams.set("Source", new URL("/ticket-sent.html", window.location.origin).href);
  const LIST_URL = new URL("AllItems.aspx", TICKETS_ROOT).href;
  const AGENTS_URL = new URL("_layouts/15/people.aspx?MembershipGroupId=5", SITE_ROOT).href;

  function setStatus(message) {
    let status = document.querySelector("#sharepoint-ticket-status");
    if (!status) {
      status = document.createElement("p");
      status.id = "sharepoint-ticket-status";
      status.className = "notice";
      status.setAttribute("role", "status");
      document.querySelector(".main-nav")?.after(status);
    }
    if (status.textContent !== message) status.textContent = message;
  }

  function openSharePoint(url, name, message) {
    const popup = window.open(url, name, "popup=yes,width=760,height=860,resizable=yes,scrollbars=yes");
    if (!popup) {
      setStatus("Your browser blocked the secure SharePoint window. Allow pop-ups and try again.");
      return;
    }
    popup.focus();
    setStatus(message);
  }

  function setText(element, text) {
    if (element && element.textContent !== text) element.textContent = text;
  }

  function syncDashboard() {
    const app = document.querySelector("#app");
    const dashboard = document.querySelector('.main-nav [data-view="dashboard"]');
    if (!app || !dashboard?.classList.contains("active") || app.querySelector("#sharepoint-ticket-source")) return;
    app.innerHTML = `
      <section id="sharepoint-ticket-source" class="panel">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Microsoft 365</span>
            <h2>Your SharePoint tickets</h2>
          </div>
        </div>
        <p>Your live ticket list is stored securely in EuropaTickets. Sign in with your Microsoft 365 account to see only the tickets you are allowed to access.</p>
        <div class="actions">
          <button class="primary" data-go="tickets" type="button">View my tickets</button>
          <button class="secondary" data-go="create" type="button">Create a ticket</button>
        </div>
      </section>
    `;
  }

  function syncInterface() {
    syncDashboard();
    setText(document.querySelector('.main-nav [data-view="create"]'), "Create a ticket");
    setText(document.querySelector('.main-nav [data-view="tickets"]'), "View my tickets");
    setText(document.querySelector('.main-nav [data-view="management"]'), "Authorised agents");
    document.querySelectorAll('[data-go="tickets"]').forEach(button => setText(button, "View my tickets"));

    const footer = document.querySelector(".team-footer");
    if (footer) {
      setText(footer.querySelector(".footer-intro span"), "Authorised agents");
      setText(footer.querySelector(".footer-intro h2"), "SharePoint support group");
      setText(footer.querySelector(".footer-intro p"), "Agents are managed in the learn.IT-Kiwi Members SharePoint group.");
      const team = footer.querySelector(".team");
      if (team && !team.hidden) team.hidden = true;
      const reset = footer.querySelector("#reset-demo");
      if (reset && !reset.hidden) reset.hidden = true;
    }
  }

  document.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    const action = event.target.closest('[data-view="create"], [data-go="create"], [data-view="tickets"], [data-go="tickets"], [data-view="management"], [data-ticket-list], [data-ticket]');
    if (!action) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const isCreate = action.matches('[data-view="create"], [data-go="create"]');
    const isAgents = action.matches('[data-view="management"]');
    openSharePoint(
      isCreate ? CREATE_URL.href : isAgents ? AGENTS_URL : LIST_URL,
      isCreate ? "kiwi-ticket-form" : isAgents ? "kiwi-authorised-agents" : "kiwi-ticket-list",
      isCreate
        ? "The secure Microsoft 365 ticket form is open."
        : isAgents
          ? "The authorised SharePoint agent group is open."
          : "Your secure SharePoint ticket list is open."
    );
  }, true);

  window.addEventListener("message", event => {
    if (event.origin !== window.location.origin || event.data?.type !== "kiwi-ticket-created") return;
    setStatus("Your ticket was submitted successfully.");
    window.focus();
  });

  const observer = new MutationObserver(syncInterface);
  observer.observe(document.querySelector("#app"), { childList: true, subtree: true });
  syncInterface();

  const requestedAction = new URL(window.location.href).searchParams.get("action");
  const requestedButton = requestedAction === "create"
    ? document.querySelector('.main-nav [data-view="create"]')
    : requestedAction === "tickets"
      ? document.querySelector('.main-nav [data-view="tickets"]')
      : null;
  if (requestedButton) {
    requestedButton.focus();
    setStatus(requestedAction === "create"
      ? "Select Create a ticket to open the secure Microsoft 365 form."
      : "Select View my tickets to open your secure SharePoint list.");
    window.history.replaceState({}, "", window.location.pathname);
  } else {
    setStatus("Create and manage your tickets securely with your Microsoft 365 account.");
  }
})();

(() => {
  const TICKETS_ROOT = "https://europarl.sharepoint.com/sites/learn.IT-Kiwi/Lists/EuropaTickets/";
  const CREATE_URL = new URL("NewForm.aspx", TICKETS_ROOT);
  CREATE_URL.searchParams.set("Source", new URL("/ticket-sent.html", window.location.origin).href);
  const LIST_URL = new URL("AllItems.aspx", TICKETS_ROOT).href;

  function setStatus(message) {
    let status = document.querySelector("#sharepoint-ticket-status");
    if (!status) {
      status = document.createElement("p");
      status.id = "sharepoint-ticket-status";
      status.className = "notice";
      status.setAttribute("role", "status");
      document.querySelector(".main-nav")?.after(status);
    }
    status.textContent = message;
  }

  function openSharePoint(url, name, message) {
    const popup = window.open(
      url,
      name,
      "popup=yes,width=760,height=860,resizable=yes,scrollbars=yes"
    );
    if (!popup) {
      setStatus("Your browser blocked the secure SharePoint window. Allow pop-ups and try again.");
      return;
    }
    popup.focus();
    setStatus(message);
  }

  function syncLabels() {
    const createNav = document.querySelector('.main-nav [data-view="create"]');
    const ticketsNav = document.querySelector('.main-nav [data-view="tickets"]');
    if (createNav) createNav.textContent = "Create a ticket";
    if (ticketsNav) ticketsNav.textContent = "View my tickets";
    document.querySelectorAll('[data-go="tickets"]').forEach(button => {
      button.textContent = "View my tickets";
    });
  }

  document.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    const action = event.target.closest(
      '[data-view="create"], [data-go="create"], [data-view="tickets"], [data-go="tickets"]'
    );
    if (!action) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const isCreate = action.matches('[data-view="create"], [data-go="create"]');
    openSharePoint(
      isCreate ? CREATE_URL.href : LIST_URL,
      isCreate ? "kiwi-ticket-form" : "kiwi-ticket-list",
      isCreate
        ? "The secure Microsoft 365 ticket form is open."
        : "Your secure SharePoint ticket list is open."
    );
  }, true);

  window.addEventListener("message", event => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== "kiwi-ticket-created") return;
    setStatus("Your ticket was submitted successfully.");
    window.focus();
  });

  const observer = new MutationObserver(syncLabels);
  observer.observe(document.querySelector("#app"), { childList: true, subtree: true });
  syncLabels();
  const requestedAction = new URL(window.location.href).searchParams.get("action");
  const requestedButton = requestedAction === "create"
    ? document.querySelector('.main-nav [data-view="create"]')
    : requestedAction === "tickets"
      ? document.querySelector('.main-nav [data-view="tickets"]')
      : null;
  if (requestedButton) {
    requestedButton.focus();
    setStatus(
      requestedAction === "create"
        ? "Select Create a ticket to open the secure Microsoft 365 form."
        : "Select View my tickets to open your secure SharePoint list."
    );
    window.history.replaceState({}, "", window.location.pathname);
  } else {
    setStatus("Create and manage your tickets securely with your Microsoft 365 account.");
  }
})();

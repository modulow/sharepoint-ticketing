export const openIntakePopup = (formUrl: string): Window | undefined => {
  const popup = window.open('about:blank', 'kiwi-ticket-form', 'popup,width=520,height=720,resizable=yes,scrollbars=yes');
  if (popup) {
    // Isolate the new window before navigating, while retaining a handle to detect closure.
    popup.opener = null;
    popup.location.replace(formUrl);
  }
  return popup || undefined;
};

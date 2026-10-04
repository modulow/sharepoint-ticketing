export const openIntakePopup = (formUrl: string): Window | undefined => {
  const popup = window.open('about:blank', '_blank', 'popup,width=520,height=720');
  if (popup) {
    // Isolate the new window before navigating, while retaining a handle to detect closure.
    popup.opener = null;
    popup.location.replace(formUrl);
  }
  return popup || undefined;
};

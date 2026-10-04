(function registerKiwiSecurePopup(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.KiwiSecurePopup = api;
  }
})(typeof window !== 'undefined' ? window : undefined, function createKiwiSecurePopup() {
  const popupName = 'kiwi-ticket-form';
  const popupFeatures = 'popup=yes,width=520,height=720,resizable=yes,scrollbars=yes';

  function open(url, browserWindow) {
    const popup = browserWindow.open(url, popupName, popupFeatures);
    if (!popup) {
      return false;
    }

    popup.opener = null;
    popup.focus();
    return true;
  }

  function initialView(search) {
    return new URLSearchParams(search).get('action') === 'create' ? 'create' : 'dashboard';
  }

  return {
    initialView,
    open,
    popupName
  };
});

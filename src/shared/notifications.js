const MAX_NOTIFICATIONS = 5;

export function createNotifier(container, options = {}) {
  const scopeClass = options.scope ? ` toast--${options.scope}` : "";
  const activeMessages = new Map();

  return function notify(message, variant = "info") {
    if (!container || !message) {
      return;
    }

    const messageKey = `${variant}:${message}`;
    const existingToast = activeMessages.get(messageKey);

    if (existingToast?.isConnected) {
      existingToast.dataset.count = String(Number(existingToast.dataset.count || "1") + 1);
      existingToast.textContent = `${message} (${existingToast.dataset.count})`;
      return;
    }

    const toast = document.createElement("div");
    toast.className = `toast toast--${variant}${scopeClass}`;
    toast.dataset.count = "1";
    toast.textContent = message;
    container.prepend(toast);
    activeMessages.set(messageKey, toast);

    while (container.children.length > MAX_NOTIFICATIONS) {
      const lastToast = container.lastElementChild;
      lastToast.remove();
    }

    window.setTimeout(() => {
      toast.remove();
      activeMessages.delete(messageKey);
    }, 3200);
  };
}

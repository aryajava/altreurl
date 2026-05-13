const MAX_NOTIFICATIONS = 5;

export function createNotifier(container) {
  return function notify(message, variant = "info") {
    if (!container || !message) {
      return;
    }

    const toast = document.createElement("div");
    toast.className = `toast toast--${variant}`;
    toast.textContent = message;
    container.prepend(toast);

    while (container.children.length > MAX_NOTIFICATIONS) {
      container.lastElementChild.remove();
    }

    window.setTimeout(() => {
      toast.remove();
    }, 3200);
  };
}

const ICON_FOLDERS = {
  dark: "w",
  light: "b"
};

export function getThemedIconPath(iconName, theme = document.documentElement.dataset.colorScheme || "light") {
  const folder = ICON_FOLDERS[theme] || ICON_FOLDERS.light;

  return `../shared/imgs/icons/${folder}/${iconName}`;
}

export function applyThemedIcons(root = document, theme = document.documentElement.dataset.colorScheme || "light") {
  root.querySelectorAll("[data-icon]").forEach((icon) => {
    icon.src = getThemedIconPath(icon.dataset.icon, theme);
  });
}

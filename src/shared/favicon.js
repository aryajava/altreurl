const ACTIVE_FAVICON_VERSION = "v2";

export function getFaviconPath(size) {
  return `../shared/imgs/favicons/${ACTIVE_FAVICON_VERSION}/Altreurl_${size}.png`;
}

export function applyFavicons(root = document) {
  const favicons = root.matches?.("[data-favicon]")
    ? [root, ...root.querySelectorAll("[data-favicon]")]
    : [...root.querySelectorAll("[data-favicon]")];

  favicons.forEach((favicon) => {
    favicon.src = getFaviconPath(favicon.dataset.favicon);
  });
}

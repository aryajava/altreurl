const ACTIVE_FAVICON_VERSION = "v2";

export function getFaviconPath(size) {
  return `../shared/imgs/favicons/${ACTIVE_FAVICON_VERSION}/Altreurl_${size}.png`;
}

export function applyFavicons(root = document) {
  root.querySelectorAll("[data-favicon]").forEach((favicon) => {
    favicon.src = getFaviconPath(favicon.dataset.favicon);
  });
}

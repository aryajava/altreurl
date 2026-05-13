# Request URL Redirector

Chromium extension for backend developers who need to debug an application against local or alternate backend endpoints.

Version `1.0.0` provides a Manifest V3 foundation for redirecting request URLs and modifying request headers, including `Authorization`, through Chrome's `declarativeNetRequest` dynamic rules.

## Development

Load the project root as an unpacked extension from `chrome://extensions`.

Branch policy:

- `main` contains stable, release-ready code only.
- `develop` is the primary integration branch for feature work.
- Feature branches should be created from `develop` and merged back into `develop`.


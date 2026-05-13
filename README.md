# Request URL Redirector

Chromium extension for backend developers who need to debug an application against local or alternate backend endpoints.

Version `1.3.0` provides a Manifest V3 foundation for redirecting request URLs and modifying request headers, including `Authorization`, through Chrome's `declarativeNetRequest` dynamic rules.

Each rule can use either `Wildcard` or `Regex` pattern format. Switching the format converts existing source and target values between wildcard and regex syntax where possible.
Rules can also sync source request headers, `Authorization`, and session cookies after the extension observes a matching source request.

Wildcard redirect example:

- Source URL pattern: `https://api.example.com/users/*`
- Redirect target URL: `http://localhost:3000/users/*`

The wildcard segment from the source request is carried into the target URL.

Regex redirect example:

- Pattern format: `Regex`
- Source URL pattern: `^https://api\.example\.com/users/(.*)$`
- Redirect target URL: `http://localhost:3000/users/\1`

Sync flow:

1. Enable the sync options in a rule.
2. Save rules.
3. Trigger one matching request in the app.
4. Reload the app flow so the redirected request uses the captured values.

## Development

Load the project root as an unpacked extension from `chrome://extensions`.

Branch policy:

- `main` contains stable, release-ready code only.
- `develop` is the primary integration branch for feature work.
- Feature branches should be created from `develop` and merged back into `develop`.

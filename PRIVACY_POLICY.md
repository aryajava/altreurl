# Privacy Policy - Altreurl

Effective date: 2026-05-16

Altreurl is a Chromium extension for backend developers who need to route configured request URLs to local or alternate backend endpoints while debugging.

## Data handled by the extension

Altreurl may handle the following data only when you configure rules that need it:

- Rule configuration, including source URL patterns, redirect target URLs, groups, pattern format, and enabled state.
- Request headers from matching source requests when credential sync is enabled.
- `Authorization` header values when manual mode or sync mode is enabled.
- Session cookie values when cookie sync is enabled.
- Browser `localStorage` or `sessionStorage` values from matching source-origin tabs when browser storage sync is enabled.
- The active tab URL, used by the popup to show rules relevant to the current page.

## How data is used

Altreurl uses this data only to provide its single purpose: configurable local debugging redirects with optional request header, authorization, and cookie forwarding.

The extension uses the data to:

- Match configured request URLs.
- Redirect matched requests to configured targets.
- Modify configured request headers.
- Sync selected credentials from the configured source request, browser storage, or cookies.
- Display relevant rules in the popup and options page.

## Storage and sharing

Rule configuration and synced credential values are stored locally in `chrome.storage.local` in your browser profile.

Altreurl does not:

- Sell user data.
- Transfer user data to advertising platforms or data brokers.
- Send rule configuration, headers, cookies, authorization values, or browsing activity to a remote server controlled by Altreurl.
- Use user data for advertising, credit-worthiness, or unrelated purposes.

When you enable a redirect rule, the browser sends the resulting request to the target URL you configured. That target may receive the headers, authorization value, or cookies you chose to set or sync as part of the debugging workflow.

Exported rule JSON files are created only when you click export. These files may contain sensitive rule data, so Altreurl shows a warning before exporting rules that include credentials.

## User control

You can remove stored data by deleting rules in the options page or uninstalling the extension from Chrome.

## Limited Use statement

Altreurl's use of information received from Chrome APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Contact

For questions or issues, use the project repository:

https://github.com/aryajava/altreurl

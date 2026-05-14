# Altreurl

Altreurl is a Chromium Extension for backend developers who need to route application requests to local or alternate backend endpoints while debugging.

The extension can redirect request URLs, modify request headers, and handle `Authorization` or session cookie forwarding through configurable rules.

Current version: `1.10.3`

## Features

- Redirect request URLs from a source endpoint to a local or alternate target endpoint.
- Support `Wildcard` and `Regex` rule formats.
- Convert pattern values when switching between wildcard and regex modes.
- Modify request headers with manual custom headers.
- Set a manual `Authorization` header.
- Sync selected credentials from the original source request:
  - request headers
  - `Authorization`
  - session cookies
- Prime synced credentials from browser storage or cookies before redirect rules run.
- Enable or disable rules individually.
- Search active rules from the popup.
- Search and filter rules from the options page.
- Organize rules by group and filter the options list by group.
- Show rule status indicators for draft, waiting sync, ready, disabled, and invalid states.
- Show status tooltips and readonly synced credential previews in tabbed sections.
- Use a wider responsive options layout with quieter rule list bulk actions and grouped editor sections.
- Keep the editor empty until a rule is selected and show synced credential previews as structured readonly rows.
- Select multiple rules and run bulk enable, disable, move, duplicate, export, or remove actions.
- Import rules from JSON as drafts and export saved or selected rules to JSON.
- Show hover tooltips on rule controls to explain how each helper behaves.
- Switch between system, light, and dark theme preferences.
- Show bounded top-right notifications for save and rule actions.
- Manage rules with Chrome `declarativeNetRequest` dynamic rules.

## Installation

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this project folder.
5. Open the Altreurl extension options page and create your redirect rules.

After editing source files, reload the extension from `chrome://extensions`.

## Basic Usage

Open the options page, then create a rule with:

- `Name`: a readable name for the rule.
- `Group`: optional grouping label for organizing related rules.
- `Pattern format`: `Wildcard` or `Regex`.
- `Source URL pattern`: the request URL to match.
- `Redirect target URL`: the destination URL.
- `Credential mode`: `Manual` or `Sync from source`.
- `Enabled`: controls whether the rule is active.

Click `Save Rule` after making changes to persist the selected rule.

## Wildcard Example

```text
Source URL pattern:
https://api.example.com/users/*

Redirect target URL:
http://localhost:3000/users/*
```

The wildcard segment from the source request is carried into the target URL.

## Regex Example

```text
Source URL pattern:
^https://api\.example\.com/users/(.*)$

Redirect target URL:
http://localhost:3000/users/\1
```

Use regex mode when you need more precise matching or capture groups.

## Credential Modes

### Manual

Use manual mode when you want to type the `Authorization` value and custom headers yourself.

### Sync from source

Use sync mode when you want Altreurl to learn credential values from a matching source request.

Request learning flow:

1. Set `Credential mode` to `Sync from source`.
2. Choose `Request learning` as the credential source.
3. Choose which values to sync: headers, `Authorization`, or session cookies.
4. Click `Save Rule`.
5. Trigger one matching source request from the original app.
6. Reload or retry the app flow so the redirected request can use the captured values.

When a rule is waiting for captured values, the options page shows a learning status.

If credentials are not available from browser storage or cookies, the first matching request must be used for learning. In that case, the first run captures credentials and the next run applies the redirect with those captured values.

Two-step flow is only possible when the required credential values can be primed before the first redirected request, such as from `localStorage`, `sessionStorage`, or cookies.

Credential source options:

- `Request learning`: capture headers, `Authorization`, and cookies from the first matching source request.
- `Browser storage`: read values from `localStorage` or `sessionStorage` in an already-open source-origin tab.
- `Cookies`: read selected cookies directly through the Chrome cookies API.

For browser storage, set:

- `Authorization key/name`: storage key that contains the token.
- `Authorization prefix`: optional prefix such as `Bearer`.
- `Headers storage key`: optional storage key containing headers as JSON, either an object or an array of `{ "name": "...", "value": "..." }`.

For cookies, set:

- `Authorization key/name`: optional cookie name to use as the authorization value.
- `Cookie names`: optional comma-separated cookie names. Leave empty to sync all cookies available for the source URL.

## Popup

The popup shows active rules, supports search, and lets you disable an active rule quickly without opening the full options page.

## Permissions

Altreurl uses these permissions:

- `declarativeNetRequest`
- `declarativeNetRequestWithHostAccess`
- `webRequest`
- `cookies`
- `scripting`
- `tabs`
- `storage`
- `<all_urls>` host access

These permissions are required so the extension can match requests, redirect them, modify request headers, read configured browser storage from matching source tabs, and sync cookies or credential headers for local debugging.

## Development

This project is a plain Manifest V3 extension. No build step is required.

Project structure:

```text
manifest.json
src/
  background/
  options/
  popup/
  shared/
```

Useful checks:

```powershell
Get-ChildItem -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('manifest.json','utf8')); console.log('manifest ok')"
```

## Git Flow

- `main` contains stable, release-ready code.
- `develop` is the primary integration branch for feature work.
- Feature branches should be created from `develop` and merged back into `develop`.
- Changes enter `main` through merges from `develop` or `hotfix/*`.

## License

Released under the MIT License. See [LICENSE](LICENSE).

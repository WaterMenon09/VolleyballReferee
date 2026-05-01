# Security Policy

## Supported versions

Volleyball Referee is a client-side web app with no server component, no user accounts, and no first-party data collection. All match state is stored locally in the browser (`localStorage`). The page does load Google Fonts and Google Analytics from third parties — beyond that, there is no backend to compromise.

That said, vulnerabilities affecting users — such as cross-site scripting (XSS) in markup or script injection through user inputs — are still taken seriously.

The current release on the `main` branch is the only supported version.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report privately via [GitHub's private vulnerability reporting](https://github.com/watermenon09/VolleyballReferee/security/advisories/new), or email **ahnaftanjid@cloudly.io** with:

- A description of the vulnerability
- Steps to reproduce or a proof-of-concept
- The potential impact
- Suggested fix (optional)

You'll receive an acknowledgement within 72 hours. If the vulnerability is confirmed, a fix will be prioritized and a patched release published. You'll be credited in the release notes unless you prefer otherwise.

## Scope

| In scope | Out of scope |
|---|---|
| XSS via user-controlled inputs (jersey numbers, team names) | Theoretical issues with no realistic exploit path |
| Script injection through `localStorage` state restore | Social engineering |
| Unintended data exposure via the PWA / service worker cache | Issues in third-party tools or browser extensions |

## Disclosure policy

Once a fix is deployed to `main` (and live at the GitHub Pages URL), the vulnerability may be disclosed publicly. Coordinated disclosure is appreciated — please allow reasonable time for a fix before publishing details.

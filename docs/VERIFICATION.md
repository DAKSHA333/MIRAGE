# Verification — MIRAGE 1.1.2 RC

## Automated results

- `npm test`: **61 passed, 0 failed**. Covers detection, overlap leakage, Unicode normalization/control rejection, secret patterns, exact restoration, per-scan isolation, realistic demo data, UI approval and stale-state gates, plain-text rendering, explicit site permission requests, worker authorization and provider DOM fixtures.
- One regression test additionally runs 250 deterministic round-trip combinations. These are correctness cases, not a representative accuracy benchmark.
- Backup tests cover AES-GCM round trip, wrong passphrase, tampering, bounded parameters/schema, import conflicts, session expiry and cancellation.
- DOM-based UI test completes encrypted download creation, clear, backup unlock, and restoration of an earlier reply.
- `npm run build`: passed. Deterministic extension ZIP and SHA-256 file manifest generated. ZIP integrity, archive hash and root manifest verified independently using Python.
- `npm audit --audit-level=high`: reported zero vulnerabilities at verification time. No third-party runtime dependency ships in the extension.
- Local server checks passed: allowed resource GET/HEAD, denied unknown paths, forbidden Host, and refused POST. These were direct HTTP checks against the running server.

## Browser evidence

Before the browser connection became unavailable, the in-app browser showed the updated page and completed the keyboard-driven sample scan, review approval and local reply restoration. A 390px viewport had 375px client and scroll widths, with no horizontal overflow. The encrypted-backup dialog opened and showed its passphrase controls. No errors appeared in the queried browser console.

Mouse automation was unreliable in that browser session and was not conclusively resolved. Keyboard interactions worked. Full mouse/touch verification remains open. Later verification used automated DOM fixtures, not a replacement live-browser claim.

## Explicitly not verified

- Full Chrome service-worker/side-panel lifecycle after the 1.1.1 permission-flow update. The user supplied evidence that 1.1.0 opened as a side panel, and that its active-tab-only connection failed.
- Signed-in live ChatGPT/Gemini adapters, provider transmissions, or streaming reply behavior. Adapters were tested against synthetic fixtures only.
- Browser-native backup file download/upload completion; DOM tests verified app behavior and encryption.
- Independent security review, broad detection accuracy, store approval or production rollout.
- GitHub CI execution. A workflow file exists, but no repository was published or remote run performed.

The release is suitable for controlled evaluation. See RELEASE-CHECKLIST.md for public-release gates. Do not equate this evidence with 100% secret detection or 95% personal-data detection.

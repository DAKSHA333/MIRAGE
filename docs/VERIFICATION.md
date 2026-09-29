# Verification — MIRAGE 1.3.0 RC

## Automated results

- `npm test`: **65 passed, 0 failed**. Covers detection, label-aware identity fields, overlap leakage, Unicode normalization/control rejection, secret patterns, exact restoration, per-scan isolation, guided judge mode, privacy receipts, realistic demo data, UI approval and stale-state gates, plain-text rendering, explicit site permission requests, worker authorization and provider DOM fixtures.
- One regression test additionally runs 250 deterministic round-trip combinations. These are correctness cases, not a representative accuracy benchmark.
- Backup tests cover AES-GCM round trip, wrong passphrase, tampering, bounded parameters/schema, import conflicts, session expiry and cancellation.
- DOM-based UI test completes encrypted download creation, clear, backup unlock, and restoration of an earlier reply.
- `npm run build`: passed. Deterministic extension ZIP and SHA-256 file manifest generated. ZIP integrity, archive hash and root manifest verified independently using Python.
- `npm audit --audit-level=high`: reported zero vulnerabilities at verification time. No third-party runtime dependency ships in the extension.
- Local server checks passed: allowed resource GET/HEAD, denied unknown paths, forbidden Host, and refused POST. These were direct HTTP checks against the running server.

## Browser evidence

Headless Chrome rendered the workspace at desktop and mobile widths. At an emulated 390px viewport, the document client and scroll widths were both 375px, with no horizontal overflow. A live DOM check started Judge Mode and displayed its privacy receipt. Automated 1.3 DOM tests report six protected onboarding fields with zero known originals in the preview, then complete approval, local sample response and restoration.

Mouse automation was unreliable in that browser session and was not conclusively resolved. Keyboard interactions worked. Full mouse/touch verification remains open. Later verification used automated DOM fixtures, not a replacement live-browser claim.

## Explicitly not verified

- Full Chrome service-worker/side-panel lifecycle for 1.3.0. The user supplied evidence that 1.1.1 connected successfully to ChatGPT after the permission-flow fix.
- Signed-in live ChatGPT/Gemini adapters, provider transmissions, or streaming reply behavior. Adapters were tested against synthetic fixtures only.
- Browser-native backup file download/upload completion; DOM tests verified app behavior and encryption.
- Independent security review, broad detection accuracy, store approval or production rollout.
- GitHub CI execution for this commit has not been independently verified.

The release is suitable for controlled evaluation. See RELEASE-CHECKLIST.md for public-release gates. Do not equate this evidence with 100% secret detection or 95% personal-data detection.

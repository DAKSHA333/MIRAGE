# MIRAGE 1.5 — Release candidate

A private AI drafting workspace for Team Nexora. Write in MIRAGE, mask locally, review the preview, and share only that preview. Restore AI replies inside MIRAGE.

**Status:** hardened release candidate for controlled testing. Live Chrome installation, current ChatGPT/Gemini compatibility and independent security review remain unverified. This is not yet a public-production claim.

## Run locally

Use Node.js 22 or newer:

```sh
npm start
```

Open http://127.0.0.1:4173. On Windows, `START-MIRAGE.cmd` starts the server and opens the page. No dependency installation is needed to run the workspace. The server binds to this computer only.

## Install or update the Chrome extension

1. Open `chrome://extensions` in Chrome 116 or newer.
2. Enable Developer mode.
3. Choose **Load unpacked**, then select this project's `extension` folder. Alternatively, extract `dist/MIRAGE-1.5.0-rc.zip` and select the extracted folder containing `manifest.json`.
4. If updating the previous unpacked extension, click **Reload** on its extension card, then close and reopen its workspace. Save an encrypted backup before reloading if you have mappings to keep.
5. Pin MIRAGE. Open ChatGPT or Gemini, then click the MIRAGE toolbar icon to open its private side panel.
6. Choose the site in MIRAGE and click **Connect current chat**. Chrome asks you to allow access only to that site if it is not already granted. The active tab must match your choice. Use **Disconnect** to remove that access.

The latest ZIP has the manifest at its root. `MIRAGE-v1-extension.zip` is the older prototype and is retained only for reference.

## The workflow

1. **Write in MIRAGE first.** Text typed directly into a chatbot is already available to that website.
2. Click **Scan & mask**. Detected secrets block copying and insertion. Remove them and scan again.
3. Review the entire preview. Add names, addresses or other missed details as custom private terms, then rescan. Check the review box to enable sharing.
4. In the extension, **Insert into chat** puts only the approved preview in the connected chatbot's empty input. It never clicks Send. An existing draft or unsupported layout stops insertion. You can also copy manually.
5. Check the chatbot draft and send it yourself. Ask the chatbot to preserve the exact MIRAGE tokens.
6. Use **Get latest reply**, or paste the reply. Choose its scan and click **Restore details**. Originals appear only in MIRAGE.

For a demonstration without an AI account, use **Intern onboarding**, **Scan & mask**, **Try a sample reply**, and **Restore details**. The scenario uses believable but synthetic identity data, and the formatted sample reply is explicitly local text rather than an AI response.

## Judge mode and privacy receipts

**Start 90-second demo** loads the synthetic intern-onboarding scenario and guides a presenter through local scanning, preview review, masked sharing and local restoration. It never approves, inserts or sends on the presenter’s behalf.

Every completed scan produces a local privacy receipt with the number of matches, unique masked values, known originals remaining in the preview and current sharing status. The receipt describes MIRAGE’s deterministic checks; it is not a claim that unknown personal data cannot be present. The patient follow-up example also demonstrates user-supplied protection for a health term and address.

## Installable desktop workspace

The hosted workspace is a Progressive Web App. In Chrome or Edge, click **Install desktop app** in MIRAGE and accept the browser installation prompt. It opens in its own window and, after the first successful load, its local masking, restoration, demo and encrypted-backup features can start offline.

The offline cache contains only versioned static application files. It never stores prompts, replies, token mappings, passphrases, analytics or extension downloads. In standalone mode, use copy/paste with any desktop AI application. Direct insertion and reply reading remain Chrome-extension features because a standalone web app cannot inspect another application's window.

## Session vault

- Up to 20 scans stay in memory. Editing a new prompt invalidates its approval but preserves earlier scan mappings for restoration.
- Save an optional encrypted `.mirage` backup before closing or reloading. It contains token mappings and scan timestamps, not full drafts or replies.
- Encryption: AES-256-GCM, random 128-bit salt, random 96-bit IV, PBKDF2-SHA256 with 600,000 iterations. Use a long unique passphrase. There is no forgotten-passphrase recovery.
- Unlocking merges compatible scans into memory. Conflicts and invalid backup structures are rejected.
- Fifteen minutes without an action in MIRAGE clears the session. Expiry is checked again after suspended timers when a control is used or the page becomes visible.
- Clear session asks for confirmation. It does not delete saved backup files or erase your operating-system clipboard. JavaScript memory cleanup is not forensic erasure.

## Detection

Local rules cover PAN, Aadhaar-shaped numbers, UPI, IFSC, email, supported Indian/international phone formats, introductory names and their repeated occurrences, and literal custom terms. Label-aware rules also protect dates of birth, Indian passport formats, bank accounts, institutional IDs, and street addresses. Aadhaar has a Verhoeff check; the other structured fields use conservative labels or format checks rather than identity verification.

Credential rules cover common API keys, labeled passwords and tokens (including JSON and environment-variable syntax), OTPs, private keys, JWT-shaped values, URL credentials and payment credentials. Overlapping matches are merged so a short custom term cannot expose the rest of an identifier. Unicode compatibility forms and selected numeral scripts are scanned with original offsets preserved. Suspicious invisible/directional controls stop the scan.

Rules can miss data or produce false positives. Names and addresses are not comprehensively detected. Unfamiliar/obfuscated secrets, images, files, voice and native chatbot editors are outside comprehensive protection. Medical facts remain unless explicitly masked. No-match results are not a privacy guarantee.

## Permissions and privacy

The extension installs with only `sidePanel`, `activeTab` and `scripting`. It declares ChatGPT and Gemini as optional host permissions; MIRAGE requests the selected site only when you click Connect, and Disconnect removes that grant. It has no install-time host access, background page monitoring, storage permission, analytics, external scripts, cloud scanner or account. Only supported HTTPS ChatGPT/Gemini origins can receive the approved preview. Provider adapters execute in the isolated world, in the top frame, and verify the connected tab and URL.

The local workspace supports manual copy/paste. Chrome integration requires the installed extension. No AWS services are connected to the app in this release.

## Optional AWS production path

Version 1.4 added a deployable AWS SAM stack matching the challenge architecture while preserving the local-first boundary. After local identifiers and secrets are removed, a future opt-in flow can send masked English text through Cognito and API Gateway to Lambda. Lambda runs a second residual-data check, asks Amazon Comprehend only for name/address suggestions, and returns character offsets without echoing detected values. DynamoDB stores approximate daily counts with a 90-day expiry, never prompt text or token mappings.

The AWS source is prepared and unit-tested but not deployed or connected to this release because this machine has no configured AWS CLI credentials. The live app therefore continues to make no prompt network request. See `infra/aws/README.md` for deployment steps and `docs/AWS-ARCHITECTURE.md` for the data boundaries.

See `extension/privacy.html` for the user-facing privacy notice and `docs/SECURITY.md` for the threat model.

Official API references used for implementation: [Chrome side panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel), [temporary activeTab access](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [script injection](https://developer.chrome.com/docs/extensions/reference/api/scripting), and [Web Crypto key derivation](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey).

## Develop and verify

```sh
npm ci
npm test
npm run build
```

There are no shipped third-party runtime dependencies. `jsdom` is a pinned development dependency for DOM-based UI and provider-adapter tests. The extension runs directly from its source folder.

The deterministic build validates JavaScript and the manifest, packages extension assets only, and writes a SHA-256 release manifest in `dist`. `.github/workflows/verify.yml` defines test, audit and packaging checks for a future GitHub repository; no remote CI run has been performed here.

| File | Responsibility |
| --- | --- |
| `extension/engine.js` | Local detection, masking, exact restoration |
| `extension/vault.js` | Bounded in-memory sessions, expiry, encrypted backups |
| `extension/app.js` | Review gate, UI and session lifecycle |
| `extension/background.js` | Validated extension-only message boundary |
| `extension/providers.js` | Narrow provider adapters, no Send action |
| `scripts/build.mjs` | Deterministic ZIP and file hashes |
| `web/` | Install manifest, local-only offline worker and desktop icons |
| `infra/aws/` | Optional authenticated AWS scan stack and Lambda boundary |
| `tests/` | Detection, security, crypto, UI and adapter tests |

See `docs/VERIFICATION.md` for observed test evidence and `docs/RELEASE-CHECKLIST.md` for unresolved public-release gates.

## Vercel deployment

`vercel.json` builds and tests a static browser workspace in `web-dist`. The hosted app keeps prompt processing in the browser. It includes a downloadable extension ZIP and SHA-256 release manifest under `/downloads/`. The optional AWS stack is source code only; no prompt API or database is deployed with Vercel. Vercel still receives ordinary web-request metadata; see the privacy notice.

```sh
npm run build:web
npx vercel --prod
```

Source repository: https://github.com/DAKSHA333/MIRAGE

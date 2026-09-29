# Security model — MIRAGE 1.1 RC

## Protected boundary

Original drafts and token mappings belong to the extension origin, not to the chatbot DOM. The user drafts in a Chrome side panel, reviews local masking, then explicitly inserts the approved preview. A webpage can observe that preview as soon as it is inserted, regardless of whether Send has been clicked.

Restored values are displayed only in MIRAGE. No vault, original prompt or passphrase is sent to the worker or provider adapter. There is no website postMessage listener or externally connectable entry point.

## Controls implemented

- Review gate, disabled copy/insertion on detected secrets and on stale scans.
- Conservative overlap unions, bounded inputs/matches, selected Unicode normalization and suspicious control rejection.
- 128-bit scan identifiers and exact per-scan restoration. Unknown tokens remain unchanged.
- Plain-text DOM rendering to prevent HTML execution from prompts and replies.
- Fifteen-minute in-memory expiry and session clearing on page lifecycle transitions.
- Explicit authenticated encrypted backups with fixed KDF parameters and validated sizes/schema. No plaintext disk persistence.
- Extension-page sender validation; explicit optional access to the selected supported HTTPS origin; active tab, selected provider and exact URL checks before injection, repeated inside the adapter. Disconnect revokes the selected origin grant.
- No automatic Send, no overwrite of existing drafts, no heuristic search through unrelated page content.
- Strict extension CSP, no network connections, no third-party runtime code.
- Loopback development server, fixed resource allowlist, Host validation, no-store responses and frame restrictions.

## Known limits

A malicious or changed provider page can misrepresent DOM content and still receives any approved text inserted into it. Adapters are convenience tools, not an independent firewall for every outgoing network request. The extension cannot protect information typed directly into the provider editor or uploaded through another control.

A compromised operating system, malicious privileged extension, unlocked physical access, clipboard monitors, or stolen backup plus passphrase are outside this boundary. Memory wiping is best effort. Backup encryption does not establish an independently audited cryptographic product.

Regex detection does not provide comprehensive entity recognition. Health data and contextual re-identification are not eliminated by masking identifiers. Unicode support is selective. User review remains necessary.

Suspended-page timers can be delayed. Expiry checks run when the page returns or a protected action is used. Passphrases/plaintext necessarily exist transiently during encryption/decryption; JavaScript does not guarantee their physical erasure.

## Before public release

Run real Chrome MV3 installation and service-worker lifecycle tests. Validate both live provider editors and reply selectors with synthetic data. Independently review cryptography, message boundaries and privacy claims. Evaluate a labeled corpus (including false positives, languages and adversarial inputs) before publishing accuracy numbers. Complete store policy and privacy disclosures. See RELEASE-CHECKLIST.md.

# Public-release gates

The 1.2.0 ZIP is a release candidate. A passing local suite does not mean these gates have passed.

## Engineering checks completed locally

- [x] Detection, overlap and Unicode regression tests.
- [x] Review-gated copy and insert, secret blocks, stale approval invalidation.
- [x] Multiple scan restoration and expiry unit tests.
- [x] Encrypted backup round trip, wrong passphrase, tamper and schema rejection.
- [x] DOM-based UI backup save/clear/unlock/restore workflow and cancellation.
- [x] Provider adapter fixture tests, sender validation, no overwrite and no automatic Send.
- [x] Guided judge workflow, realistic onboarding and patient scenarios, and local privacy receipt checks.
- [x] Extension-only deterministic ZIP with SHA-256 manifest and ZIP integrity check.
- [x] Privacy notice, threat model, installation and demo instructions.

## Still required before public production

- [ ] Install/reload 1.2.0 in actual Chrome; verify side-panel behavior, optional site-access prompt, Disconnect revocation, service-worker suspension and recovery.
- [ ] Test current signed-in ChatGPT and Gemini with synthetic data only. Check empty/multiline editors, navigation, preexisting drafts, missing permissions, streaming and multiple replies. Verify the provider receives only the approved text.
- [ ] Complete mouse/touch and keyboard checks on desktop and side-panel widths. Prior browser mouse automation was unreliable; keyboard flow worked, so mouse behavior is not certified.
- [ ] Verify real browser download/upload backup workflow, corrupted file, wrong passphrase and forgotten-passphrase copy. Automated DOM and crypto coverage is already present.
- [ ] Independent security review of permission scope, crypto, DOM interaction and privacy messaging.
- [ ] Evaluate representative labeled personal-data and secret examples, adversarial encodings and false positives. Do not advertise a 95% or 100% accuracy claim from the synthetic regression tests.
- [ ] Test with a small consenting pilot group and record issues without collecting raw prompts.
- [ ] Publish a privacy policy with the actual operator/support contact; complete Chrome Web Store listing, disclosures and review.
- [ ] Run CI in the actual source repository; establish signed release ownership, update/rollback process and issue triage.

## Demo sequence

1. Click **Start 90-second demo** and explain why original drafts start inside MIRAGE.
2. Scan the onboarding scenario, explain the privacy receipt, review, and approve.
3. Insert the masked text into a supported chat after confirming live compatibility, or use the transparent manual-copy fallback.
4. Show reply tokens restored inside MIRAGE.
5. Load the synthetic secret sample and demonstrate blocking.
6. Save an encrypted backup, clear the session, unlock it, and restore the earlier reply.
7. State the release-candidate boundaries and next validation steps honestly.

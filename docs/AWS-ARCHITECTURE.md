# Optional AWS architecture

MIRAGE uses a local-first trust boundary. The browser performs deterministic masking, blocks recognized secrets, keeps token mappings, and restores replies. The optional AWS path improves suggestions for English names and addresses after that local pass.

```text
Original prompt
  -> local rules block secrets and replace known identifiers
  -> user reviews masked preview and explicitly enables AWS assistance
  -> Cognito JWT -> API Gateway -> Lambda residual-data gate
  -> Amazon Comprehend receives masked text
  -> Lambda returns NAME/ADDRESS offsets only
  -> browser decides whether to apply each suggestion
  -> AI provider receives only the final user-approved tokenized prompt

DynamoDB receives daily aggregate counts only, with a 90-day TTL.
```

## Trust boundaries

| Boundary | Receives | Must not receive |
| --- | --- | --- |
| MIRAGE browser | Original prompt, token mappings, restored reply | — |
| Optional AWS scan | User-approved masked English text, random scan ID | Token mappings, passphrases, restored replies |
| DynamoDB | Date, approximate scan count, suggestion count, expiry | Prompt text, offsets, detected values, user identity |
| AI provider | Final reviewed tokenized prompt | MIRAGE token mappings |

The API requires a Cognito identity, an exact allowed web origin, explicit request consent and a successful residual-data gate. API Gateway data tracing is off. The function emits no prompt logs and returns only type, offset and confidence metadata. Its IAM permissions are limited to Comprehend PII detection and one DynamoDB table update.

Daily counters are operational indicators, not billing-grade records. DynamoDB atomic counters can overcount retried writes. No accuracy claim should be made until the detector is evaluated on a representative, consented and labeled dataset.

## Current release state

The SAM stack and tested Lambda core are deployment-ready source artifacts. They are not deployed because this machine has no configured AWS CLI or account credentials. MIRAGE 1.4 continues to run in local mode, with no prompt network request. Connecting AWS assistance is a separate release step that requires authentication UX, consent UX, end-to-end browser testing, an AWS privacy review and cost controls.

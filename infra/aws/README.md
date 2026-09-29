# Optional AWS privacy assistance

This stack implements the cloud boundary shown in the MIRAGE challenge architecture. It is optional: the current app remains fully usable in local mode.

## Privacy contract

MIRAGE must finish its local scan before calling this API. A request requires explicit consent and contains only:

- a random scan identifier;
- English text after local IDs, contacts and secrets have been replaced by MIRAGE tokens; and
- the language code.

The Lambda rejects obvious residual email addresses, Indian phone numbers, PAN, Aadhaar-shaped numbers and common secret formats. Amazon Comprehend is limited to `NAME` and `ADDRESS` suggestions. The response contains character offsets, entity types and confidence scores; it never echoes detected text. The application code stores no prompt or detected value. DynamoDB receives approximate daily scan and suggestion counts with a 90-day expiry.

This defense is intentionally layered, not a guarantee. Local rules can miss sensitive text. AWS still processes the masked text when the user chooses cloud assistance. Comprehend real-time PII analysis currently supports English and Spanish; this stack accepts English only.

## Deploy to Mumbai

Prerequisites are an AWS account, configured AWS CLI credentials, and AWS SAM CLI. Review the account's pricing and service availability first.

```sh
sam build --template-file infra/aws/template.yaml
sam deploy --guided --region ap-south-1 --capabilities CAPABILITY_IAM
```

Keep the default `AllowedOrigin` only if the production site is `https://mirage-phi-lilac.vercel.app`. SAM outputs the API endpoint, Cognito user-pool ID and browser client ID. Create pilot users administratively; public self-sign-up is disabled.

The function packages its AWS SDK v3 clients instead of relying on the runtime copy. API Gateway body tracing is disabled. The Lambda role can call only Comprehend PII detection and update the aggregate table.

The stack is prepared but has not been deployed from this repository. The live MIRAGE build remains local-only until the endpoint and Cognito flow are deliberately connected and tested.

Delete a test stack when it is no longer needed:

```sh
sam delete --stack-name mirage-privacy-assist --region ap-south-1
```

References: [Comprehend real-time PII](https://docs.aws.amazon.com/comprehend/latest/dg/realtime-pii-api.html), [SAM Cognito authorizers](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-property-api-cognitoauthorizer.html), [Lambda Node.js packaging](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html), and [DynamoDB atomic counters](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithItems.html).

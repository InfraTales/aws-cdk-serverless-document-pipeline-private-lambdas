# InfraTales | AWS CDK Serverless Document Pipeline: Private Lambdas Without NAT Gateway

AWS CDK (TypeScript) reference architecture. Serverless pillar, advanced level.

> **Newer version:** [aws-cdk-private-lambda-document-intake](https://github.com/InfraTales/aws-cdk-private-lambda-document-intake) rebuilds this pipeline with presigned uploads, hashed API keys, endpoint policies and 35 tests. It fixes the ten problems listed under [Known issues in this version](#known-issues-in-this-version). This repo stays as the first version.

[![License: InfraTales](https://img.shields.io/badge/License-InfraTales-blue.svg)](LICENSE)
[![AWS CDK TypeScript](https://img.shields.io/badge/AWS%20CDK-TypeScript-purple.svg)](https://aws.amazon.com/cdk/)
[![Level](https://img.shields.io/badge/Level-advanced-orange.svg)](https://infratales.com/p/30e5996f-81d1-4c49-a469-31607e45f66b/)

Teams that take documents from outside (contracts, KYC uploads, compliance files) need more than a bucket and a presigned URL. They need an audit trail, a format check and access control that a security review will accept. This project puts all of that behind an authenticated API, keeps the Lambda functions in private subnets, and does it without a NAT gateway.

## What's in it

The app has four CDK constructs, `NetworkingStack`, `StorageStack`, `ComputeStack` and `ApiStack`, wired together in `TapStack`.

1. A client calls API Gateway with an `X-Api-Key` header.
2. A Lambda authorizer looks the key up in a DynamoDB table.
3. The API function takes the file as base64 JSON, writes it to an encrypted S3 bucket under `documents/`, and stores a record in DynamoDB with the status `UPLOADED`.
4. S3 triggers the document processor, which reads the object's metadata and marks the record `PROCESSED`.
5. Failed processor runs end up in a dead-letter queue. DynamoDB Streams are on for the documents table if you want to attach a consumer for status changes (this repo doesn't include one).

The Lambda functions run in isolated subnets with no NAT gateway. They reach S3 and DynamoDB through gateway endpoints, which have no hourly charge.

See [`diagrams/`](diagrams/) for the architecture, sequence and data flow diagrams, and [`docs/architecture.md`](docs/architecture.md) for each component's job.

## Design decisions

- **No NAT gateway.** That saves about $73 a month for two AZs in us-east-1. The price is that the functions can't call anything on the internet. A third-party virus scanner, a webhook or an external validation API would fail until you add an interface endpoint or change the design.
- **An API Gateway interface endpoint** sits in the VPC. It costs about $7.30 a month per AZ. In this version nothing calls it, which is one of the known issues below.
- **The authorizer checks DynamoDB on every request.** A cache TTL of 300 seconds would cut those reads, at the cost of revoked keys working for up to 5 minutes.
- **DynamoDB Streams deliver at least once.** Any consumer you add has to cope with duplicates.
- **KMS-encrypted CloudWatch Logs** need the key policy to allow the `logs.<region>.amazonaws.com` service principal. CDK doesn't add that for you, and it's a common reason deployments fail.

The [full guide on InfraTales](https://infratales.com/p/30e5996f-81d1-4c49-a469-31607e45f66b/) covers the cost model, the alternatives and what breaks at scale.

## Getting started

You need Node.js 20 or newer (CI uses 24), the AWS CLI with credentials, and CDK bootstrapped in your account:

```bash
git clone https://github.com/InfraTales/aws-cdk-serverless-document-pipeline-private-lambdas.git
cd aws-cdk-serverless-document-pipeline-private-lambdas
npm ci
npm run check   # type check, tests, cdk synth
npx cdk bootstrap aws://YOUR_ACCOUNT_ID/YOUR_REGION   # once per account and region
```

## Deploy

```bash
# See what will change
npx cdk diff -c environmentSuffix=dev

# Deploy to dev
npx cdk deploy -c environmentSuffix=dev

# Deploy to prod and approve any security-related changes by hand
npx cdk deploy -c environmentSuffix=prod --require-approval broadening
```

Run `cdk diff` before every production deploy and read the IAM and security group changes.

### Try the API

Add a client to the API keys table. This version stores keys as plain text (see the known issues):

```bash
aws dynamodb put-item --table-name api-keys-dev \
  --item '{"apiKey":{"S":"my-test-key"},"userId":{"S":"user-1"}}'
```

Upload a file as base64 JSON, then list your documents:

```bash
curl -X POST "$API_URL/documents" -H "X-Api-Key: my-test-key" -H "Content-Type: application/json" \
  -d "{\"fileName\":\"hello.txt\",\"contentType\":\"text/plain\",\"content\":\"$(echo hello | base64)\"}"
curl "$API_URL/documents" -H "X-Api-Key: my-test-key"
```

The document shows `UPLOADED` first and `PROCESSED` once the processor has run. `$API_URL` is the `ApiUrl` output from the deploy.

## Known issues in this version

The newer repo fixes all ten:

1. An API Gateway interface endpoint that no function calls (about $14.60 a month for two AZs).
2. The authorizer cache TTL is 0, so every request runs the authorizer and a DynamoDB read.
3. The usage plan never applies, because the methods don't require the API key.
4. CORS allows every origin.
5. API keys sit in the table as plain text.
6. The DLQs on the authorizer and API functions do nothing. API Gateway calls those two and waits for the answer, and DLQs only cover async calls.
7. The VPC default security group still allows traffic.
8. The bucket has no S3 Bucket Key and accepts plain HTTP.
9. `RemovalPolicy.DESTROY` on tables that hold document metadata.
10. Log groups keep logs forever.

Uploads also pass through Lambda as base64, so API Gateway's 10 MB payload limit caps the file size.

## Docs

| Document | What's in it |
|---|---|
| [Architecture](docs/architecture.md) | Components, their jobs and the data flow |
| [Runbook](docs/runbook.md) | What to do when something breaks |
| [Cost model](docs/cost.md) | Cost by component and environment (₹) |
| [Security](docs/security.md) | Controls, IAM boundaries, compliance notes |
| [Troubleshooting](docs/troubleshooting.md) | Common problems and fixes |

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to send changes and [SECURITY.md](SECURITY.md) for how to report a vulnerability.

## License

See [LICENSE](LICENSE). The code is here for reference and learning.

Built by [Rahul Ladumor](https://www.rahulladumor.com) | [InfraTales](https://infratales.com)

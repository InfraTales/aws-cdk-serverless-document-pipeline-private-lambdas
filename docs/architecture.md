# Architecture

This page explains what each part of the stack does and how a document moves through it.

## The four constructs

`TapStack` wires together four CDK constructs:

| Construct | What it creates |
|---|---|
| `NetworkingStack` | A VPC with two isolated subnets, no NAT gateway, gateway endpoints for S3 and DynamoDB, and an interface endpoint for API Gateway |
| `StorageStack` | A KMS key, the documents bucket, the `documents` table and the `api-keys` table |
| `ComputeStack` | Three Lambda functions, their IAM roles, three dead-letter queues and five CloudWatch alarms |
| `ApiStack` | The REST API, the Lambda authorizer, an API key and a usage plan |

## How an upload works

1. The client calls `POST /documents` with an `X-Api-Key` header and the file as base64 JSON.
2. The authorizer looks the key up in the `api-keys` table and passes the `userId` on.
3. The API function writes the file to S3 under `documents/<id>/` with the document ID in the object metadata. Then it stores a record with the status `UPLOADED`.
4. S3 calls the document processor. It reads the object metadata, without downloading the file, and sets the status to `PROCESSED`.
5. The client calls `GET /documents/{id}` to read the status.

The diagrams in [`../diagrams/`](../diagrams/) show the same flow.

## Why there's no NAT gateway

All three functions run in isolated subnets. They reach S3 and DynamoDB through gateway endpoints, which have no hourly charge. Two NAT gateways would cost about $73 a month in us-east-1 before any traffic.

The trade-off: the functions can't call anything on the internet. A third-party scanner or webhook would need an interface endpoint or a different design.

## Things to know before you change it

- **The authorizer reads DynamoDB on every request.** Its cache TTL is 0. A TTL of 300 seconds cuts the reads, but a revoked key then keeps working for up to 5 minutes.
- **DynamoDB Streams are on** for the `documents` table. Nothing reads them yet. If you add one, make it safe to run twice, because streams deliver records at least once.
- **Uploads pass through Lambda as base64.** API Gateway's 10 MB payload limit caps the file size.

The [README](../README.md#known-issues-in-this-version) lists the known issues. The newer [aws-cdk-private-lambda-document-intake](https://github.com/InfraTales/aws-cdk-private-lambda-document-intake) repo fixes them.

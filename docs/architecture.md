# Architecture Notes

## Overview

The system composes four CDK stacks — NetworkingStack, StorageStack, ComputeStack, and ApiStack — wired together in a parent TapStack. Documents enter through API Gateway (Interface VPC endpoint), pass a Lambda Authorizer that validates API keys against DynamoDB, land in an encrypted S3 bucket, and immediately trigger a Document Processor Lambda that writes metadata back to DynamoDB with Streams enabled. The non-obvious design choice is zero NAT Gateways: all Lambda-to-AWS-service traffic routes exclusively through S3 and DynamoDB Gateway endpoints plus the API Gateway Interface endpoint, keeping Lambdas in fully isolated private subnets at no per-GB data cost. DynamoDB Streams then fan out to a Notification Lambda for downstream status updates, and a Dead Letter Queue catches any processing failures before they disappear silently. [from-code]

## Key Decisions

- Zero NAT Gateways saves ~$65-130/month per AZ but means Lambdas cannot reach any non-AWS internet endpoint — third-party virus scanning, webhook callbacks, or external validation APIs all break silently at runtime unless you add Interface endpoints or redesign the flow. [inferred]
- API Gateway Interface VPC endpoint adds ~$16/month per AZ and roughly 1-2ms of latency per call compared to the public endpoint, but it is the only way to keep the API callable from inside the VPC without internet exposure. [inferred]
- A Lambda Authorizer that validates API keys against DynamoDB on every request adds a cold-start-sensitive latency spike of 100-500ms and burns DynamoDB read capacity — authorizer caching (TTL 300s) is the fix, but caching means revoked keys stay valid for up to 5 minutes. [editorial]
- DynamoDB Streams feeding a Notification Lambda creates at-least-once delivery semantics — duplicate processing of status updates is guaranteed under retry conditions, so the Notification Lambda must be idempotent or you will generate duplicate notifications in production. [inferred]
- KMS encryption on CloudWatch Logs requires the KMS key policy to explicitly grant the logs.us-east-1.amazonaws.com service principal access, and this is the single most common deployment failure in setups like this — CDK does not enforce it automatically. [editorial]
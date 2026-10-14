# Security

The controls this version has, and the gaps it still has.
## What's in place

| Control | Where |
|---|---|
| Lambda functions in isolated subnets, with no route to the internet | `NetworkingStack` |
| One security group allowing only outbound HTTPS | `NetworkingStack` |
| A KMS key with rotation, used for the bucket and both tables | `StorageStack` |
| Bucket blocks all public access and keeps versions | `StorageStack` |
| Point-in-time recovery on the documents table | `StorageStack` |
| A separate IAM role per function, scoped to its table, bucket and key | `ComputeStack` |
| Every API method behind the Lambda authorizer | `ApiStack` |
## Known gaps

- API keys sit in the table as plain text.
- CORS allows every origin.
- The bucket accepts plain HTTP and has no S3 Bucket Key.
- The VPC default security group still allows traffic.
- Both tables use `RemovalPolicy.DESTROY`, so `cdk destroy` deletes them.
- Log groups have no retention period.

The newer [aws-cdk-private-lambda-document-intake](https://github.com/InfraTales/aws-cdk-private-lambda-document-intake) repo closes all of these. Use it for anything beyond learning.
## Reporting a problem

Follow the steps in [SECURITY.md](../SECURITY.md) to report it privately.

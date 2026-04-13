# Serverless Document Processing System - AWS CDK TypeScript

Build a serverless document processing system using AWS CDK with TypeScript. The system handles customer document uploads, processes them automatically to extract metadata and validate formats, stores everything with audit trails, and provides API access for authorized applications.

## What We Need

Deploy a serverless document processing infrastructure that demonstrates event-driven architecture. The solution must integrate S3, DynamoDB, Lambda, and API Gateway with proper security controls and VPC endpoints for secure service communication.

## Environment Setup

- Framework: AWS CDK with TypeScript
- Deployment Region: us-east-1
- Architecture Pattern: Event-driven serverless
- Security Approach: Least privilege IAM with encryption
- Naming Convention: Use prefix 'prod' for resources

## Core Infrastructure Components

### Storage Services

- Amazon S3 Bucket for document storage with server-side encryption
- Amazon DynamoDB Table for document metadata with DynamoDB Streams enabled

### Compute Services

Create at least two Lambda functions:

- Document Processor: S3 events trigger this function to process uploaded documents
- API Handler: Handles API Gateway requests for document operations

Both functions should use Node.js runtime with environment variables for configuration.

### API Layer

- Amazon API Gateway providing RESTful endpoints with Lambda integration
- API Keys for client authentication
- Lambda Authorizer implementing custom authorization logic that validates API keys
- Request validation with input checking and rate limiting

### VPC and Networking

- VPC Configuration with private subnets for Lambda functions
- S3 VPC Endpoint using Gateway type
- DynamoDB VPC Endpoint using Gateway type
- API Gateway VPC Endpoint using Interface type
- Security Groups with minimal required access for Lambda functions

## Security Requirements

### IAM Least Privilege

- Lambda Execution Roles: Separate roles per function with minimal permissions
- S3 Policies: Bucket-specific read/write access only
- DynamoDB Policies: Table-specific operations only
- API Gateway: Execution role for Lambda authorizer

### Encryption

- S3: Server-side encryption with AES-256 or KMS
- DynamoDB: Encryption at rest enabled
- API Gateway: HTTPS endpoints only
- Lambda: Environment variables encryption
- CloudWatch Logs: KMS encryption

## Event-Driven Workflow

### Document Upload Flow

API Gateway calls Lambda Authorizer which validates the API key. Then API Handler Lambda stores the document in S3. The S3 event triggers the Document Processor Lambda for processing.

### Processing Flow

Document Processor extracts metadata and validates format. DynamoDB stores document metadata and status. DynamoDB Streams trigger a Notification Lambda for status updates.

## Monitoring and Observability

- CloudWatch Logs for centralized logging across all Lambda functions
- CloudWatch Alarms to monitor Lambda errors and DynamoDB throttling
- Dead Letter Queues to handle failed Lambda executions

## CDK Stack Structure

- Main Stack: tap-stack.ts containing all serverless resources
- Modular Organization: Separate constructs for storage, compute, and API layers
- Environment Support: dev/staging/prod configurations

## Lambda Function Requirements

- Document Processor: Handles S3 events and processes documents
- API Handler: Manages document upload and retrieval operations
- Lambda Authorizer: Validates API keys and permissions against DynamoDB
- Error Handling: Try-catch blocks with CloudWatch logging

## Success Criteria

The solution must demonstrate:

1. Complete CDK TypeScript implementation with proper imports and stack structure
2. Secure API Gateway with Lambda authorizers validating API keys and permissions
3. Event-driven document processing connecting S3, Lambda, and DynamoDB
4. Enterprise-grade security with least privilege IAM and complete encryption
5. KMS encryption at rest for S3, DynamoDB, Lambda, and CloudWatch Logs
6. HTTPS/TLS encryption in transit for all service communications
7. Comprehensive audit logging with CloudTrail, CloudWatch, and access monitoring
8. Error handling and resilience with DLQ and retry mechanisms
9. Security monitoring with CloudWatch alarms for unauthorized access attempts

## Lambda Authorizer Implementation

Create API Gateway with usage plans and API keys. The Lambda authorizer must validate API keys against DynamoDB permissions table, return IAM policy allowing or denying specific API operations, and log all authorization attempts to CloudWatch. Configure different permission levels including read-only, read-write, and admin.

## Constraints

- Serverless-first approach focusing on managed services and event-driven patterns
- Single region deployment in us-east-1
- Core services: S3, DynamoDB, Lambda, API Gateway with VPC endpoints
- Least privilege IAM with specific permissions, no wildcards
- Cost optimization with on-demand billing and right-sized resources
- Well documented with clear comments explaining serverless patterns

This infrastructure must be deployable using standard CDK commands and demonstrate serverless best practices with secure service communication.

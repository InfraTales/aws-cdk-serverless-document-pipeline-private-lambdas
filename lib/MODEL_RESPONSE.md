# Serverless Document Processing System - AWS CDK TypeScript Implementation

I'll design and implement a comprehensive serverless document processing system that meets all your requirements. This solution demonstrates enterprise-grade serverless architecture with robust security, event-driven processing, and VPC endpoints.

## Project Structure

```
serverless-document-processing/
├── lib/
│   ├── constructs/
│   │   ├── api-layer.ts
│   │   ├── compute-layer.ts
│   │   ├── networking-layer.ts
│   │   └── storage-layer.ts
│   ├── lambda/
│   │   ├── api-handler/
│   │   │   └── index.ts
│   │   ├── document-processor/
│   │   │   └── index.ts
│   │   ├── lambda-authorizer/
│   │   │   └── index.ts
│   │   └── notification-handler/
│   │       └── index.ts
│   └── prod-document-processing-stack.ts
├── bin/
│   └── app.ts
├── package.json
└── cdk.json
```

## 1. Main CDK Stack Implementation

### `lib/prod-document-processing-stack.ts`

```typescript
import * as cdk from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import { Construct } from 'constructs';
import { NetworkingLayer } from './constructs/networking-layer';
import { StorageLayer } from './constructs/storage-layer';
import { ComputeLayer } from './constructs/compute-layer';
import { ApiLayer } from './constructs/api-layer';

export interface DocumentProcessingStackProps extends cdk.StackProps {
  environment: 'dev' | 'staging' | 'prod';
}

export class ProdDocumentProcessingStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: DocumentProcessingStackProps
  ) {
    super(scope, id, props);

    // Create KMS key for encryption at rest
    const kmsKey = new kms.Key(this, 'ProdDocumentProcessingKey', {
      alias: `prod-document-processing-${props.environment}`,
      description: 'KMS key for document processing system encryption',
      enableKeyRotation: true,
      keySpec: kms.KeySpec.SYMMETRIC_DEFAULT,
      keyUsage: kms.KeyUsage.ENCRYPT_DECRYPT,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // CloudTrail for audit logging
    const cloudTrailLogGroup = new logs.LogGroup(
      this,
      'ProdCloudTrailLogGroup',
      {
        logGroupName: `/aws/cloudtrail/prod-document-processing-${props.environment}`,
        retention: logs.RetentionDays.ONE_YEAR,
        encryptionKey: kmsKey,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      }
    );

    const trail = new cloudtrail.Trail(this, 'ProdDocumentProcessingTrail', {
      trailName: `prod-document-processing-${props.environment}`,
      cloudWatchLogGroup: cloudTrailLogGroup,
      encryptionKey: kmsKey,
      includeGlobalServiceEvents: true,
      isMultiRegionTrail: false,
      enableFileValidation: true,
    });

    // 1. Networking Layer - VPC with private subnets and VPC endpoints
    const networking = new NetworkingLayer(this, 'ProdNetworking', {
      environment: props.environment,
      kmsKey,
    });

    // 2. Storage Layer - S3 bucket and DynamoDB tables
    const storage = new StorageLayer(this, 'ProdStorage', {
      environment: props.environment,
      kmsKey,
    });

    // 3. Compute Layer - Lambda functions
    const compute = new ComputeLayer(this, 'ProdCompute', {
      environment: props.environment,
      kmsKey,
      vpc: networking.vpc,
      lambdaSecurityGroup: networking.lambdaSecurityGroup,
      documentBucket: storage.documentBucket,
      metadataTable: storage.metadataTable,
      apiKeysTable: storage.apiKeysTable,
    });

    // 4. API Layer - API Gateway with Lambda authorizer
    const api = new ApiLayer(this, 'ProdApi', {
      environment: props.environment,
      kmsKey,
      vpc: networking.vpc,
      apiHandlerFunction: compute.apiHandlerFunction,
      authorizerFunction: compute.authorizerFunction,
      vpcEndpoint: networking.apiGatewayVpcEndpoint,
    });

    // CloudWatch Alarms for security monitoring
    this.createSecurityAlarms(compute, api, kmsKey);

    // Outputs
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: api.restApi.url,
      description: 'API Gateway URL for document processing',
    });

    new cdk.CfnOutput(this, 'DocumentBucketName', {
      value: storage.documentBucket.bucketName,
      description: 'S3 bucket for document storage',
    });

    new cdk.CfnOutput(this, 'KMSKeyId', {
      value: kmsKey.keyId,
      description: 'KMS key for encryption',
    });
  }

  private createSecurityAlarms(
    compute: ComputeLayer,
    api: ApiLayer,
    kmsKey: kms.Key
  ): void {
    // Alarm for unauthorized API access attempts
    const unauthorizedAccessAlarm = new cdk.aws_cloudwatch.Alarm(
      this,
      'UnauthorizedAccessAlarm',
      {
        alarmName: 'prod-document-processing-unauthorized-access',
        alarmDescription: 'Alarm for unauthorized API access attempts',
        metric: api.restApi.metricClientError({
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 10,
        evaluationPeriods: 2,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );

    // Alarm for Lambda function errors
    const lambdaErrorAlarm = new cdk.aws_cloudwatch.Alarm(
      this,
      'LambdaErrorAlarm',
      {
        alarmName: 'prod-document-processing-lambda-errors',
        alarmDescription: 'Alarm for Lambda function errors',
        metric: compute.apiHandlerFunction.metricErrors({
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 5,
        evaluationPeriods: 2,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
  }
}
```

## 2. Networking Layer with VPC Endpoints

### `lib/constructs/networking-layer.ts`

```typescript
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export interface NetworkingLayerProps {
  environment: string;
  kmsKey: kms.Key;
}

export class NetworkingLayer extends Construct {
  public readonly vpc: ec2.Vpc;
  public readonly lambdaSecurityGroup: ec2.SecurityGroup;
  public readonly s3VpcEndpoint: ec2.GatewayVpcEndpoint;
  public readonly dynamoDbVpcEndpoint: ec2.GatewayVpcEndpoint;
  public readonly apiGatewayVpcEndpoint: ec2.InterfaceVpcEndpoint;

  constructor(scope: Construct, id: string, props: NetworkingLayerProps) {
    super(scope, id);

    // Create VPC with private subnets only
    this.vpc = new ec2.Vpc(this, 'ProdVpc', {
      vpcName: `prod-document-processing-vpc-${props.environment}`,
      maxAzs: 2,
      natGateways: 0, // No NAT gateways for cost optimization
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    // Security group for Lambda functions
    this.lambdaSecurityGroup = new ec2.SecurityGroup(
      this,
      'ProdLambdaSecurityGroup',
      {
        vpc: this.vpc,
        securityGroupName: `prod-lambda-sg-${props.environment}`,
        description:
          'Security group for Lambda functions in document processing system',
        allowAllOutbound: false, // Explicit outbound rules
      }
    );

    // Allow HTTPS outbound for AWS services
    this.lambdaSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'HTTPS outbound for AWS services'
    );

    // S3 VPC Endpoint (Gateway)
    this.s3VpcEndpoint = this.vpc.addGatewayEndpoint('ProdS3VpcEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }],
    });

    // DynamoDB VPC Endpoint (Gateway)
    this.dynamoDbVpcEndpoint = this.vpc.addGatewayEndpoint(
      'ProdDynamoDbVpcEndpoint',
      {
        service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
        subnets: [{ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }],
      }
    );

    // API Gateway VPC Endpoint (Interface)
    this.apiGatewayVpcEndpoint = new ec2.InterfaceVpcEndpoint(
      this,
      'ProdApiGatewayVpcEndpoint',
      {
        vpc: this.vpc,
        service: ec2.InterfaceVpcEndpointAwsService.APIGATEWAY,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        securityGroups: [this.lambdaSecurityGroup],
        privateDnsEnabled: true,
        policyDocument: new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              principals: [new cdk.aws_iam.AnyPrincipal()],
              actions: ['execute-api:Invoke'],
              resources: ['*'],
            }),
          ],
        }),
      }
    );

    // Tags for compliance
    cdk.Tags.of(this.vpc).add('Environment', props.environment);
    cdk.Tags.of(this.vpc).add('Purpose', 'DocumentProcessing');
    cdk.Tags.of(this.vpc).add('Security', 'Private');
  }
}
```

## 3. Storage Layer with Encryption

### `lib/constructs/storage-layer.ts`

```typescript
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export interface StorageLayerProps {
  environment: string;
  kmsKey: kms.Key;
}

export class StorageLayer extends Construct {
  public readonly documentBucket: s3.Bucket;
  public readonly metadataTable: dynamodb.Table;
  public readonly apiKeysTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: StorageLayerProps) {
    super(scope, id);

    // S3 Bucket for document storage with comprehensive security
    this.documentBucket = new s3.Bucket(this, 'ProdDocumentBucket', {
      bucketName: `prod-document-processing-${props.environment}-${cdk.Aws.ACCOUNT_ID}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: props.kmsKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: 'cost-optimization',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
      notificationConfiguration: {
        cloudWatchConfiguration: {
          logGroupName: `/aws/s3/prod-document-processing-${props.environment}`,
        },
      },
    });

    // DynamoDB table for document metadata with streams
    this.metadataTable = new dynamodb.Table(this, 'ProdMetadataTable', {
      tableName: `prod-document-metadata-${props.environment}`,
      partitionKey: { name: 'documentId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'version', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.ON_DEMAND,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: props.kmsKey,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      deletionProtection: true,
    });

    // Global Secondary Index for querying by status
    this.metadataTable.addGlobalSecondaryIndex({
      indexName: 'StatusIndex',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
    });

    // DynamoDB table for API keys and permissions
    this.apiKeysTable = new dynamodb.Table(this, 'ProdApiKeysTable', {
      tableName: `prod-api-keys-${props.environment}`,
      partitionKey: { name: 'apiKey', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.ON_DEMAND,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: props.kmsKey,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      deletionProtection: true,
    });

    // Add sample API keys for testing
    new cdk.CustomResource(this, 'SampleApiKeys', {
      onUpdate: {
        service: 'DynamoDB',
        action: 'batchWriteItem',
        parameters: {
          RequestItems: {
            [this.apiKeysTable.tableName]: [
              {
                PutRequest: {
                  Item: {
                    apiKey: { S: 'admin-key-12345' },
                    permissions: { S: 'admin' },
                    description: { S: 'Admin API key for full access' },
                    createdAt: { N: Date.now().toString() },
                    active: { BOOL: true },
                  },
                },
              },
              {
                PutRequest: {
                  Item: {
                    apiKey: { S: 'read-only-key-67890' },
                    permissions: { S: 'read-only' },
                    description: { S: 'Read-only API key' },
                    createdAt: { N: Date.now().toString() },
                    active: { BOOL: true },
                  },
                },
              },
            ],
          },
        },
        physicalResourceId: cdk.PhysicalResourceId.of('sample-api-keys'),
      },
      policy: cdk.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [this.apiKeysTable.tableArn],
      }),
    });

    // Tags for compliance
    cdk.Tags.of(this.documentBucket).add('Environment', props.environment);
    cdk.Tags.of(this.documentBucket).add('DataClassification', 'Confidential');
    cdk.Tags.of(this.metadataTable).add('Environment', props.environment);
    cdk.Tags.of(this.metadataTable).add('DataClassification', 'Confidential');
  }
}
```

## 4. Compute Layer with Lambda Functions

### `lib/constructs/compute-layer.ts`

```typescript
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';

export interface ComputeLayerProps {
  environment: string;
  kmsKey: kms.Key;
  vpc: ec2.Vpc;
  lambdaSecurityGroup: ec2.SecurityGroup;
  documentBucket: s3.Bucket;
  metadataTable: dynamodb.Table;
  apiKeysTable: dynamodb.Table;
}

export class ComputeLayer extends Construct {
  public readonly apiHandlerFunction: lambda.Function;
  public readonly documentProcessorFunction: lambda.Function;
  public readonly authorizerFunction: lambda.Function;
  public readonly notificationFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: ComputeLayerProps) {
    super(scope, id);

    // Dead Letter Queue for failed Lambda executions
    const dlq = new sqs.Queue(this, 'ProdLambdaDlq', {
      queueName: `prod-lambda-dlq-${props.environment}`,
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: props.kmsKey,
      retentionPeriod: cdk.Duration.days(14),
    });

    // Common Lambda configuration
    const commonLambdaProps = {
      runtime: lambda.Runtime.NODEJS_18_X,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [props.lambdaSecurityGroup],
      deadLetterQueue: dlq,
      environment: {
        ENVIRONMENT: props.environment,
        METADATA_TABLE_NAME: props.metadataTable.tableName,
        API_KEYS_TABLE_NAME: props.apiKeysTable.tableName,
        DOCUMENT_BUCKET_NAME: props.documentBucket.bucketName,
        KMS_KEY_ID: props.kmsKey.keyId,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'es2020',
        externalModules: ['aws-sdk'],
      },
      logRetention: logs.RetentionDays.ONE_YEAR,
      logRetentionRetryOptions: {
        maxRetries: 3,
      },
    };

    // Lambda Authorizer Function
    this.authorizerFunction = new nodejs.NodejsFunction(
      this,
      'ProdAuthorizerFunction',
      {
        ...commonLambdaProps,
        functionName: `prod-lambda-authorizer-${props.environment}`,
        entry: 'lib/lambda/lambda-authorizer/index.ts',
        handler: 'handler',
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        description: 'Lambda authorizer for API Gateway authentication',
      }
    );

    // API Handler Function
    this.apiHandlerFunction = new nodejs.NodejsFunction(
      this,
      'ProdApiHandlerFunction',
      {
        ...commonLambdaProps,
        functionName: `prod-api-handler-${props.environment}`,
        entry: 'lib/lambda/api-handler/index.ts',
        handler: 'handler',
        timeout: cdk.Duration.seconds(30),
        memorySize: 512,
        description: 'API handler for document operations',
      }
    );

    // Document Processor Function
    this.documentProcessorFunction = new nodejs.NodejsFunction(
      this,
      'ProdDocumentProcessorFunction',
      {
        ...commonLambdaProps,
        functionName: `prod-document-processor-${props.environment}`,
        entry: 'lib/lambda/document-processor/index.ts',
        handler: 'handler',
        timeout: cdk.Duration.minutes(5),
        memorySize: 1024,
        description: 'Processes documents uploaded to S3',
      }
    );

    // Notification Handler Function
    this.notificationFunction = new nodejs.NodejsFunction(
      this,
      'ProdNotificationFunction',
      {
        ...commonLambdaProps,
        functionName: `prod-notification-handler-${props.environment}`,
        entry: 'lib/lambda/notification-handler/index.ts',
        handler: 'handler',
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        description: 'Handles DynamoDB stream events for notifications',
      }
    );

    // IAM Roles with least privilege
    this.createIamRoles(props);

    // S3 Event Notification
    props.documentBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(this.documentProcessorFunction),
      { prefix: 'documents/' }
    );

    // DynamoDB Stream Event Source
    this.notificationFunction.addEventSource(
      new lambdaEventSources.DynamoEventSource(props.metadataTable, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 10,
        retryAttempts: 3,
      })
    );

    // CloudWatch Log Groups with encryption
    this.createLogGroups(props.kmsKey, props.environment);
  }

  private createIamRoles(props: ComputeLayerProps): void {
    // Authorizer function permissions
    this.authorizerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:GetItem', 'dynamodb:Query'],
        resources: [props.apiKeysTable.tableArn],
      })
    );

    this.authorizerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['kms:Decrypt', 'kms:DescribeKey'],
        resources: [props.kmsKey.keyArn],
      })
    );

    // API Handler function permissions
    this.apiHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
        resources: [`${props.documentBucket.bucketArn}/*`],
      })
    );

    this.apiHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:Query',
        ],
        resources: [
          props.metadataTable.tableArn,
          `${props.metadataTable.tableArn}/index/*`,
        ],
      })
    );

    // Document Processor function permissions
    this.documentProcessorFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:GetObject', 's3:GetObjectVersion'],
        resources: [`${props.documentBucket.bucketArn}/*`],
      })
    );

    this.documentProcessorFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:PutItem', 'dynamodb:UpdateItem'],
        resources: [props.metadataTable.tableArn],
      })
    );

    // Notification function permissions
    this.notificationFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:DescribeStream',
          'dynamodb:GetRecords',
          'dynamodb:GetShardIterator',
          'dynamodb:ListStreams',
        ],
        resources: [`${props.metadataTable.tableArn}/stream/*`],
      })
    );

    // KMS permissions for all functions
    [
      this.apiHandlerFunction,
      this.documentProcessorFunction,
      this.notificationFunction,
    ].forEach(func => {
      func.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'kms:Decrypt',
            'kms:DescribeKey',
            'kms:Encrypt',
            'kms:GenerateDataKey',
          ],
          resources: [props.kmsKey.keyArn],
        })
      );
    });
  }

  private createLogGroups(kmsKey: kms.Key, environment: string): void {
    const functions = [
      this.authorizerFunction,
      this.apiHandlerFunction,
      this.documentProcessorFunction,
      this.notificationFunction,
    ];

    functions.forEach((func, index) => {
      new logs.LogGroup(this, `ProdLogGroup${index}`, {
        logGroupName: `/aws/lambda/${func.functionName}`,
        retention: logs.RetentionDays.ONE_YEAR,
        encryptionKey: kmsKey,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });
    });
  }
}
```

## 5. API Layer with Lambda Authorizer

### `lib/constructs/api-layer.ts`

```typescript
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface ApiLayerProps {
  environment: string;
  kmsKey: kms.Key;
  vpc: ec2.Vpc;
  apiHandlerFunction: lambda.Function;
  authorizerFunction: lambda.Function;
  vpcEndpoint: ec2.InterfaceVpcEndpoint;
}

export class ApiLayer extends Construct {
  public readonly restApi: apigateway.RestApi;
  public readonly usagePlan: apigateway.UsagePlan;

  constructor(scope: Construct, id: string, props: ApiLayerProps) {
    super(scope, id);

    // CloudWatch Log Group for API Gateway
    const apiLogGroup = new logs.LogGroup(this, 'ProdApiGatewayLogGroup', {
      logGroupName: `/aws/apigateway/prod-document-processing-${props.environment}`,
      retention: logs.RetentionDays.ONE_YEAR,
      encryptionKey: props.kmsKey,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Lambda Authorizer
    const authorizer = new apigateway.TokenAuthorizer(this, 'ProdLambdaAuthorizer', {
      handler: props.authorizerFunction,
      identitySource: 'method.request.header.x-api-key',
      authorizerName: `prod-lambda-authorizer-${props.environment}`,
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

    // REST API Gateway
    this.restApi = new apigateway.RestApi(this, 'ProdDocumentProcessingApi', {
      restApiName: `prod-document-processing-api-${props.environment}`,
      description: 'Serverless document processing API with Lambda authorizer',
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL],
        vpcEndpoints: [props.vpcEndpoint],
      },
      policy: new cdk.aws_iam.PolicyDocument({
        statements: [
          new cdk.aws_iam.PolicyStatement({
            effect: cdk.aws_iam.Effect.ALLOW,
            principals: [new cdk.aws_iam.AnyPrincipal()],
            actions: ['execute-api:Invoke'],
            resources: ['*'],
            conditions: {
              StringEquals: {
                'aws:sourceVpce': props.vpcEndpoint.vpcEndpointId,
              },
            },
          }),
        ],
      }),
      deployOptions: {
        stageName: props.environment,
        accessLogDestination: new apigateway.LogGroupLogDestination(apiLogGroup),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
          caller: true,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true,
        }),
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true,
        throttlingBurstLimit: 100,
        throttlingRateLimit: 50,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'x-api-key', 'Authorization'],
      },
    });

    // Request validator
    const requestValidator = new apigateway.RequestValidator(this, 'ProdRequestValidator', {
      restApi: this.restApi,
      requestValidatorName: 'prod-request-validator',
      validateRequestBody: true,
      validateRequestParameters: true,
    });

    // API Resources and Methods
    this.createApiResources
```

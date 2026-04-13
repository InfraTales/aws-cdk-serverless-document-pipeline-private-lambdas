import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface ComputeStackProps {
  environmentSuffix: string;
  vpc: ec2.Vpc;
  lambdaSecurityGroup: ec2.SecurityGroup;
  documentBucket: s3.Bucket;
  documentsTable: dynamodb.Table;
  apiKeysTable: dynamodb.Table;
  documentEncryptionKey: kms.Key;
}

export class ComputeStack extends Construct {
  public readonly authorizerFunction: lambda.Function;
  public readonly documentProcessorFunction: lambda.Function;
  public readonly apiHandlerFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id);

    // Dead Letter Queues for error handling
    const authorizerDLQ = new sqs.Queue(this, 'AuthorizerDLQ', {
      retentionPeriod: cdk.Duration.days(14),
    });

    const documentProcessorDLQ = new sqs.Queue(this, 'DocumentProcessorDLQ', {
      retentionPeriod: cdk.Duration.days(14),
    });

    const apiHandlerDLQ = new sqs.Queue(this, 'ApiHandlerDLQ', {
      retentionPeriod: cdk.Duration.days(14),
    });

    // Lambda Execution Roles with Least Privilege
    const authorizerRole = new iam.Role(this, 'AuthorizerRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaVPCAccessExecutionRole'
        ),
      ],
      inlinePolicies: {
        DynamoDbAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['dynamodb:GetItem'],
              resources: [props.apiKeysTable.tableArn],
            }),
          ],
        }),
        KmsAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['kms:Decrypt', 'kms:DescribeKey'],
              resources: [props.documentEncryptionKey.keyArn],
            }),
          ],
        }),
      },
    });

    const documentProcessorRole = new iam.Role(this, 'DocumentProcessorRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaVPCAccessExecutionRole'
        ),
      ],
      inlinePolicies: {
        S3Access: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['s3:GetObject', 's3:GetObjectVersion'],
              resources: [`${props.documentBucket.bucketArn}/*`],
            }),
          ],
        }),
        DynamoDbAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['dynamodb:PutItem', 'dynamodb:UpdateItem'],
              resources: [props.documentsTable.tableArn],
            }),
          ],
        }),
        KmsAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['kms:Decrypt', 'kms:DescribeKey'],
              resources: [props.documentEncryptionKey.keyArn],
            }),
          ],
        }),
      },
    });

    const apiHandlerRole = new iam.Role(this, 'ApiHandlerRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaVPCAccessExecutionRole'
        ),
      ],
      inlinePolicies: {
        S3Access: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['s3:PutObject', 's3:GetObject'],
              resources: [`${props.documentBucket.bucketArn}/*`],
            }),
          ],
        }),
        DynamoDbAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'dynamodb:GetItem',
                'dynamodb:PutItem',
                'dynamodb:Query',
                'dynamodb:Scan',
              ],
              resources: [
                props.documentsTable.tableArn,
                `${props.documentsTable.tableArn}/index/*`,
              ],
            }),
          ],
        }),
        KmsAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'kms:Decrypt',
                'kms:DescribeKey',
                'kms:GenerateDataKey',
              ],
              resources: [props.documentEncryptionKey.keyArn],
            }),
          ],
        }),
      },
    });

    // Lambda Functions with external code and error handling
    this.authorizerFunction = new lambda.Function(this, 'AuthorizerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'authorizer.handler',
      code: lambda.Code.fromAsset('lib/lambda'),
      role: authorizerRole,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [props.lambdaSecurityGroup],
      environment: {
        API_KEYS_TABLE: props.apiKeysTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      deadLetterQueue: authorizerDLQ,
      deadLetterQueueEnabled: true,
      retryAttempts: 2,
    });

    this.documentProcessorFunction = new lambda.Function(
      this,
      'DocumentProcessorFunction',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'documentProcessor.handler',
        code: lambda.Code.fromAsset('lib/lambda'),
        role: documentProcessorRole,
        vpc: props.vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        securityGroups: [props.lambdaSecurityGroup],
        environment: {
          DOCUMENTS_TABLE: props.documentsTable.tableName,
        },
        timeout: cdk.Duration.minutes(5),
        memorySize: 512,
        deadLetterQueue: documentProcessorDLQ,
        deadLetterQueueEnabled: true,
        retryAttempts: 2,
      }
    );

    this.apiHandlerFunction = new lambda.Function(this, 'ApiHandlerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'apiHandler.handler',
      code: lambda.Code.fromAsset('lib/lambda'),
      role: apiHandlerRole,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [props.lambdaSecurityGroup],
      environment: {
        DOCUMENTS_BUCKET: props.documentBucket.bucketName,
        DOCUMENTS_TABLE: props.documentsTable.tableName,
      },
      timeout: cdk.Duration.minutes(2),
      memorySize: 512,
      deadLetterQueue: apiHandlerDLQ,
      deadLetterQueueEnabled: true,
      retryAttempts: 2,
    });

    // S3 Event Trigger for Document Processing
    props.documentBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(this.documentProcessorFunction),
      { prefix: 'documents/' }
    );

    // CloudWatch Alarms for Monitoring
    this.authorizerFunction
      .metricErrors({
        period: cdk.Duration.minutes(5),
      })
      .createAlarm(this, 'AuthorizerErrorAlarm', {
        threshold: 5,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

    this.documentProcessorFunction
      .metricErrors({
        period: cdk.Duration.minutes(5),
      })
      .createAlarm(this, 'ProcessorErrorAlarm', {
        threshold: 3,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

    this.apiHandlerFunction
      .metricErrors({
        period: cdk.Duration.minutes(5),
      })
      .createAlarm(this, 'ApiHandlerErrorAlarm', {
        threshold: 3,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

    // Latency monitoring
    this.authorizerFunction
      .metricDuration({
        period: cdk.Duration.minutes(5),
      })
      .createAlarm(this, 'AuthorizerLatencyAlarm', {
        threshold: 5000, // 5 seconds
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

    this.documentProcessorFunction
      .metricDuration({
        period: cdk.Duration.minutes(5),
      })
      .createAlarm(this, 'ProcessorLatencyAlarm', {
        threshold: 300000, // 5 minutes
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
  }
}

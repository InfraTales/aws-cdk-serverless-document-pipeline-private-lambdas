import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface StorageStackProps {
  environmentSuffix: string;
}

export class StorageStack extends Construct {
  public readonly documentBucket: s3.Bucket;
  public readonly documentsTable: dynamodb.Table;
  public readonly apiKeysTable: dynamodb.Table;
  public readonly documentEncryptionKey: kms.Key;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id);

    // KMS Key for document encryption
    this.documentEncryptionKey = new kms.Key(this, 'DocumentEncryptionKey', {
      description: 'KMS key for document encryption',
      enableKeyRotation: true,
      alias: `alias/documents-${props.environmentSuffix}`,
    });

    // S3 Bucket for document storage with KMS encryption
    this.documentBucket = new s3.Bucket(this, 'DocumentsBucket', {
      bucketName: `documents-${props.environmentSuffix}-${this.node.addr.substring(0, 8)}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.documentEncryptionKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      lifecycleRules: [
        {
          id: 'DeleteIncompleteMultipartUploads',
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
        {
          id: 'TransitionToIA',
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
        },
      ],
    });

    // DynamoDB Tables with proper design and KMS encryption
    this.documentsTable = new dynamodb.Table(this, 'DocumentsTable', {
      tableName: `documents-${props.environmentSuffix}`,
      partitionKey: {
        name: 'documentId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'uploadTimestamp',
        type: dynamodb.AttributeType.NUMBER,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: this.documentEncryptionKey,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Add Global Secondary Index for efficient queries by userId
    this.documentsTable.addGlobalSecondaryIndex({
      indexName: 'userId-uploadTimestamp-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'uploadTimestamp', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add GSI for status-based queries
    this.documentsTable.addGlobalSecondaryIndex({
      indexName: 'status-uploadTimestamp-index',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'uploadTimestamp', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.apiKeysTable = new dynamodb.Table(this, 'ApiKeysTable', {
      tableName: `api-keys-${props.environmentSuffix}`,
      partitionKey: {
        name: 'apiKey',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: this.documentEncryptionKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}

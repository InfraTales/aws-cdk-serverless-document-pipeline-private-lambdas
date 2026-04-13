import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ApiStack } from './stacks/api-stack';
import { ComputeStack } from './stacks/compute-stack';
import { NetworkingStack } from './stacks/networking-stack';
import { StorageStack } from './stacks/storage-stack';

export interface TapStackProps extends cdk.StackProps {
  environmentSuffix?: string;
}

export class TapStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: TapStackProps = {}) {
    super(scope, id, props);

    // Resolve environment suffix from props, context, or default
    const environmentSuffix =
      props.environmentSuffix ||
      this.node.tryGetContext('environmentSuffix') ||
      'prod';

    // Networking Stack
    const networkingStack = new NetworkingStack(this, 'NetworkingStack', {
      environmentSuffix,
    });

    // Storage Stack
    const storageStack = new StorageStack(this, 'StorageStack', {
      environmentSuffix,
    });

    // Compute Stack
    const computeStack = new ComputeStack(this, 'ComputeStack', {
      environmentSuffix,
      vpc: networkingStack.vpc,
      lambdaSecurityGroup: networkingStack.lambdaSecurityGroup,
      documentBucket: storageStack.documentBucket,
      documentsTable: storageStack.documentsTable,
      apiKeysTable: storageStack.apiKeysTable,
      documentEncryptionKey: storageStack.documentEncryptionKey,
    });

    // API Stack
    const apiStack = new ApiStack(this, 'ApiStack', {
      environmentSuffix,
      authorizerFunction: computeStack.authorizerFunction,
      apiHandlerFunction: computeStack.apiHandlerFunction,
    });

    // Stack Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: apiStack.api.url,
      description: 'API Gateway URL',
      exportName: `${this.stackName}-ApiUrl`,
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: apiStack.api.url,
      description: 'API Gateway endpoint URL (for backward compatibility)',
      exportName: `${this.stackName}-ApiEndpoint`,
    });

    new cdk.CfnOutput(this, 'ApiId', {
      value: apiStack.api.restApiId,
      description: 'API Gateway REST API ID',
      exportName: `${this.stackName}-ApiId`,
    });

    new cdk.CfnOutput(this, 'ApiKeyId', {
      value: apiStack.apiKey.keyId,
      description: 'API Key ID',
      exportName: `${this.stackName}-ApiKeyId`,
    });

    new cdk.CfnOutput(this, 'UsagePlanId', {
      value: apiStack.usagePlan.usagePlanId,
      description: 'API Gateway Usage Plan ID',
      exportName: `${this.stackName}-UsagePlanId`,
    });

    new cdk.CfnOutput(this, 'AuthorizerFunctionName', {
      value: computeStack.authorizerFunction.functionName,
      description: 'Lambda Authorizer function name',
      exportName: `${this.stackName}-AuthorizerFunctionName`,
    });

    new cdk.CfnOutput(this, 'AuthorizerFunctionArn', {
      value: computeStack.authorizerFunction.functionArn,
      description: 'Lambda Authorizer function ARN',
      exportName: `${this.stackName}-AuthorizerFunctionArn`,
    });

    new cdk.CfnOutput(this, 'DocumentProcessorFunctionName', {
      value: computeStack.documentProcessorFunction.functionName,
      description: 'Document Processor Lambda function name',
      exportName: `${this.stackName}-DocumentProcessorFunctionName`,
    });

    new cdk.CfnOutput(this, 'DocumentProcessorFunctionArn', {
      value: computeStack.documentProcessorFunction.functionArn,
      description: 'Document Processor Lambda function ARN',
      exportName: `${this.stackName}-DocumentProcessorFunctionArn`,
    });

    new cdk.CfnOutput(this, 'ApiHandlerFunctionName', {
      value: computeStack.apiHandlerFunction.functionName,
      description: 'API Handler Lambda function name',
      exportName: `${this.stackName}-ApiHandlerFunctionName`,
    });

    new cdk.CfnOutput(this, 'ApiHandlerFunctionArn', {
      value: computeStack.apiHandlerFunction.functionArn,
      description: 'API Handler Lambda function ARN',
      exportName: `${this.stackName}-ApiHandlerFunctionArn`,
    });

    new cdk.CfnOutput(this, 'DocumentBucketName', {
      value: storageStack.documentBucket.bucketName,
      description: 'Document storage bucket name',
      exportName: `${this.stackName}-DocumentBucketName`,
    });

    new cdk.CfnOutput(this, 'DocumentsBucketName', {
      value: storageStack.documentBucket.bucketName,
      description: 'Document storage bucket name (for backward compatibility)',
      exportName: `${this.stackName}-DocumentsBucketName`,
    });

    new cdk.CfnOutput(this, 'DocumentsBucketArn', {
      value: storageStack.documentBucket.bucketArn,
      description: 'Document storage bucket ARN',
      exportName: `${this.stackName}-DocumentsBucketArn`,
    });

    new cdk.CfnOutput(this, 'DocumentsTableName', {
      value: storageStack.documentsTable.tableName,
      description: 'Documents DynamoDB table name',
      exportName: `${this.stackName}-DocumentsTableName`,
    });

    new cdk.CfnOutput(this, 'DocumentsTableArn', {
      value: storageStack.documentsTable.tableArn,
      description: 'Documents DynamoDB table ARN',
      exportName: `${this.stackName}-DocumentsTableArn`,
    });

    new cdk.CfnOutput(this, 'DocumentsTableStreamArn', {
      value: storageStack.documentsTable.tableStreamArn || 'No stream enabled',
      description: 'Documents table stream ARN',
      exportName: `${this.stackName}-DocumentsTableStreamArn`,
    });

    new cdk.CfnOutput(this, 'ApiKeysTableName', {
      value: storageStack.apiKeysTable.tableName,
      description: 'API Keys DynamoDB table name',
      exportName: `${this.stackName}-ApiKeysTableName`,
    });

    new cdk.CfnOutput(this, 'ApiKeysTableArn', {
      value: storageStack.apiKeysTable.tableArn,
      description: 'API Keys DynamoDB table ARN',
      exportName: `${this.stackName}-ApiKeysTableArn`,
    });

    new cdk.CfnOutput(this, 'VpcId', {
      value: networkingStack.vpc.vpcId,
      description: 'VPC ID',
      exportName: `${this.stackName}-VpcId`,
    });

    new cdk.CfnOutput(this, 'VpcCidr', {
      value: networkingStack.vpc.vpcCidrBlock,
      description: 'VPC CIDR block',
      exportName: `${this.stackName}-VpcCidr`,
    });

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value: networkingStack.vpc.isolatedSubnets
        .map(subnet => subnet.subnetId)
        .join(','),
      description: 'Comma-separated list of private isolated subnet IDs',
      exportName: `${this.stackName}-PrivateSubnetIds`,
    });

    new cdk.CfnOutput(this, 'LambdaSecurityGroupId', {
      value: networkingStack.lambdaSecurityGroup.securityGroupId,
      description: 'Security Group ID for Lambda functions',
      exportName: `${this.stackName}-LambdaSecurityGroupId`,
    });

    new cdk.CfnOutput(this, 'S3VpcEndpointId', {
      value: networkingStack.s3Endpoint.vpcEndpointId,
      description: 'S3 VPC Endpoint ID',
      exportName: `${this.stackName}-S3VpcEndpointId`,
    });

    new cdk.CfnOutput(this, 'DynamoDbVpcEndpointId', {
      value: networkingStack.dynamoEndpoint.vpcEndpointId,
      description: 'DynamoDB VPC Endpoint ID',
      exportName: `${this.stackName}-DynamoDbVpcEndpointId`,
    });

    new cdk.CfnOutput(this, 'ApiGatewayVpcEndpointId', {
      value: networkingStack.apiGatewayEndpoint.vpcEndpointId,
      description: 'API Gateway VPC Endpoint ID',
      exportName: `${this.stackName}-ApiGatewayVpcEndpointId`,
    });

    new cdk.CfnOutput(this, 'EnvironmentSuffix', {
      value: environmentSuffix,
      description: 'Environment suffix used for resource naming',
      exportName: `${this.stackName}-EnvironmentSuffix`,
    });

    new cdk.CfnOutput(this, 'Region', {
      value: this.region,
      description: 'AWS Region',
      exportName: `${this.stackName}-Region`,
    });

    new cdk.CfnOutput(this, 'AccountId', {
      value: this.account,
      description: 'AWS Account ID',
      exportName: `${this.stackName}-AccountId`,
    });

    // Integration Test Endpoints
    new cdk.CfnOutput(this, 'DocumentUploadEndpoint', {
      value: `${apiStack.api.url}documents`,
      description: 'Full URL for document upload endpoint',
      exportName: `${this.stackName}-DocumentUploadEndpoint`,
    });

    new cdk.CfnOutput(this, 'DocumentListEndpoint', {
      value: `${apiStack.api.url}documents`,
      description: 'Full URL for document list endpoint',
      exportName: `${this.stackName}-DocumentListEndpoint`,
    });

    new cdk.CfnOutput(this, 'DocumentRetrieveEndpoint', {
      value: `${apiStack.api.url}documents/{documentId}`,
      description: 'URL template for document retrieve endpoint',
      exportName: `${this.stackName}-DocumentRetrieveEndpoint`,
    });
  }
}

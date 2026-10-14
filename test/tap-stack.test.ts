import * as fs from 'fs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { TapStack } from '../lib/tap-stack';

const template = Template.fromStack(new TapStack(new cdk.App(), 'TapStacktest', { environmentSuffix: 'test' }));

test('the handler files the stack points at exist', () => {
  for (const file of ['authorizer.js', 'apiHandler.js', 'documentProcessor.js']) {
    expect(fs.existsSync(path.join(__dirname, '..', 'lib', 'lambda', file))).toBe(true);
  }
});

test('no NAT gateway, isolated subnets only', () => {
  template.resourceCountIs('AWS::EC2::NatGateway', 0);
  template.resourceCountIs('AWS::EC2::InternetGateway', 0);
});

test('three application functions on a supported Node.js runtime', () => {
  const fns = template.findResources('AWS::Lambda::Function', { Properties: { Runtime: 'nodejs24.x' } });
  const handlers = Object.values(fns).map((f) => f.Properties.Handler).sort();
  expect(handlers).toEqual(expect.arrayContaining(['apiHandler.handler', 'authorizer.handler', 'documentProcessor.handler']));
});

test('S3 and DynamoDB gateway endpoints exist', () => {
  template.resourcePropertiesCountIs('AWS::EC2::VPCEndpoint', { VpcEndpointType: 'Gateway' }, 2);
});

import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

// The handlers are plain JavaScript (loaded by lambda.Code.fromAsset), so require them.
const authorizer = require('../lib/lambda/authorizer');
const api = require('../lib/lambda/apiHandler');
const processor = require('../lib/lambda/documentProcessor');

const ddb = mockClient(DynamoDBClient);
const s3 = mockClient(S3Client);

beforeEach(() => {
  ddb.reset();
  s3.reset();
});

describe('authorizer', () => {
  const event = (key?: string) => ({ methodArn: 'arn:aws:execute-api:us-east-1:123456789012:abc/prod/GET/documents', headers: key ? { 'X-Api-Key': key } : {} });

  test('rejects a missing key', async () => {
    await expect(authorizer.handler(event())).rejects.toThrow('Unauthorized');
  });

  test('rejects an unknown key', async () => {
    ddb.on(GetItemCommand).resolves({});
    await expect(authorizer.handler(event('nope'))).rejects.toThrow('Unauthorized');
  });

  test('allows a known key and passes the userId on', async () => {
    ddb.on(GetItemCommand).resolves({ Item: { apiKey: { S: 'k1' }, userId: { S: 'user-7' } } });
    const res = await authorizer.handler(event('k1'));
    expect(res.policyDocument.Statement[0].Effect).toBe('Allow');
    expect(res.context.userId).toBe('user-7');
  });
});

describe('api handler', () => {
  const req = (method: string, opts: { body?: object; documentId?: string } = {}) => ({
    httpMethod: method,
    body: opts.body ? JSON.stringify(opts.body) : null,
    pathParameters: opts.documentId ? { documentId: opts.documentId } : null,
    requestContext: { authorizer: { userId: 'user-7' } },
  });

  test('POST stores the file in S3 with metadata and writes an UPLOADED record', async () => {
    s3.on(PutObjectCommand).resolves({});
    ddb.on(PutItemCommand).resolves({});
    const res = await api.handler(req('POST', {
      body: { fileName: 'contract v2.pdf', contentType: 'application/pdf', content: Buffer.from('%PDF-1.7').toString('base64') },
    }));
    expect(res.statusCode).toBe(201);

    const put = s3.commandCalls(PutObjectCommand)[0].args[0].input;
    const { documentId } = JSON.parse(res.body);
    expect(put.Key).toBe(`documents/${documentId}/contract_v2.pdf`);
    expect(put.Metadata).toMatchObject({ documentid: documentId, userid: 'user-7' });

    const item = ddb.commandCalls(PutItemCommand)[0].args[0].input.Item!;
    expect(item.status).toEqual({ S: 'UPLOADED' });
    expect(item.uploadTimestamp.N).toBe(put.Metadata!.uploadtimestamp);
  });

  test('POST rejects a body without content', async () => {
    const res = await api.handler(req('POST', { body: { fileName: 'a.pdf', contentType: 'application/pdf' } }));
    expect(res.statusCode).toBe(400);
  });

  test('GET /documents lists the caller\'s documents from the userId index', async () => {
    ddb.on(QueryCommand).resolves({ Items: [{ documentId: { S: 'd1' }, uploadTimestamp: { N: '1' }, status: { S: 'PROCESSED' }, userId: { S: 'user-7' } }] });
    const res = await api.handler(req('GET'));
    expect(res.statusCode).toBe(200);
    expect(ddb.commandCalls(QueryCommand)[0].args[0].input.IndexName).toBe('userId-uploadTimestamp-index');
    expect(JSON.parse(res.body).documents[0]).toMatchObject({ documentId: 'd1', status: 'PROCESSED' });
  });

  test('GET /documents/{id} hides other users\' documents', async () => {
    ddb.on(QueryCommand).resolves({ Items: [{ documentId: { S: 'd1' }, uploadTimestamp: { N: '1' }, userId: { S: 'someone-else' } }] });
    expect((await api.handler(req('GET', { documentId: 'd1' }))).statusCode).toBe(404);
  });
});

describe('document processor', () => {
  const s3Event = { Records: [{ s3: { bucket: { name: 'b' }, object: { key: 'documents/d1/contract+v2.pdf', size: 1234 } } }] };

  test('marks the record PROCESSED using the object metadata', async () => {
    s3.on(HeadObjectCommand).resolves({ ContentType: 'application/pdf', Metadata: { documentid: 'd1', uploadtimestamp: '1700000000000' } });
    ddb.on(UpdateItemCommand).resolves({});
    await processor.handler(s3Event);

    expect(s3.commandCalls(HeadObjectCommand)[0].args[0].input.Key).toBe('documents/d1/contract v2.pdf');
    const update = ddb.commandCalls(UpdateItemCommand)[0].args[0].input;
    expect(update.Key).toEqual({ documentId: { S: 'd1' }, uploadTimestamp: { N: '1700000000000' } });
    expect(update.ExpressionAttributeValues![':s']).toEqual({ S: 'PROCESSED' });
  });

  test('skips objects that were not uploaded through the API', async () => {
    s3.on(HeadObjectCommand).resolves({ Metadata: {} });
    await processor.handler(s3Event);
    expect(ddb.commandCalls(UpdateItemCommand)).toHaveLength(0);
  });

  test('skips a record that no longer exists, and rethrows real errors', async () => {
    s3.on(HeadObjectCommand).resolves({ Metadata: { documentid: 'd1', uploadtimestamp: '1' } });
    ddb.on(UpdateItemCommand).rejectsOnce(new ConditionalCheckFailedException({ message: 'x', $metadata: {} }));
    await expect(processor.handler(s3Event)).resolves.toBeUndefined();

    ddb.on(UpdateItemCommand).rejects(new Error('boom'));
    await expect(processor.handler(s3Event)).rejects.toThrow('boom');
  });
});

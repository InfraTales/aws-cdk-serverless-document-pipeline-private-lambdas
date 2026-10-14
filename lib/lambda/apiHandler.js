// API handler for POST /documents, GET /documents and GET /documents/{documentId}.
// Uploads arrive as base64 in the JSON body, so API Gateway's 10 MB payload limit applies.
const { randomUUID } = require('crypto');
const { DynamoDBClient, PutItemCommand, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const db = new DynamoDBClient({});
const s3 = new S3Client({});

const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'];

const respond = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const toDocument = (item) => ({
  documentId: item.documentId.S,
  fileName: item.fileName && item.fileName.S,
  status: item.status && item.status.S,
  uploadTimestamp: Number(item.uploadTimestamp.N),
  sizeBytes: item.sizeBytes ? Number(item.sizeBytes.N) : undefined,
});

async function upload(event, userId) {
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { message: 'Body must be JSON' });
  }
  const { fileName, contentType, content } = body;
  if (!fileName || !content || !ALLOWED_TYPES.includes(contentType)) {
    return respond(400, { message: `Send fileName, content (base64) and contentType (${ALLOWED_TYPES.join(', ')})` });
  }

  const documentId = randomUUID();
  const uploadTimestamp = Date.now();
  const key = `documents/${documentId}/${fileName.replace(/[^\w.\-]/g, '_')}`;

  await s3.send(new PutObjectCommand({
    Bucket: process.env.DOCUMENTS_BUCKET,
    Key: key,
    Body: Buffer.from(content, 'base64'),
    ContentType: contentType,
    // The processor reads these to find the DynamoDB item (documentId + uploadTimestamp).
    Metadata: { documentid: documentId, uploadtimestamp: String(uploadTimestamp), userid: userId },
  }));

  await db.send(new PutItemCommand({
    TableName: process.env.DOCUMENTS_TABLE,
    Item: {
      documentId: { S: documentId },
      uploadTimestamp: { N: String(uploadTimestamp) },
      userId: { S: userId },
      fileName: { S: fileName },
      s3Key: { S: key },
      status: { S: 'UPLOADED' },
    },
  }));

  return respond(201, { documentId, status: 'UPLOADED' });
}

async function list(userId) {
  const { Items = [] } = await db.send(new QueryCommand({
    TableName: process.env.DOCUMENTS_TABLE,
    IndexName: 'userId-uploadTimestamp-index',
    KeyConditionExpression: 'userId = :u',
    ExpressionAttributeValues: { ':u': { S: userId } },
    ScanIndexForward: false,
    Limit: 50,
  }));
  return respond(200, { documents: Items.map(toDocument) });
}

async function getOne(documentId, userId) {
  const { Items = [] } = await db.send(new QueryCommand({
    TableName: process.env.DOCUMENTS_TABLE,
    KeyConditionExpression: 'documentId = :d',
    ExpressionAttributeValues: { ':d': { S: documentId } },
    Limit: 1,
  }));
  const item = Items[0];
  if (!item || item.userId.S !== userId) return respond(404, { message: 'Not found' });
  return respond(200, toDocument(item));
}

exports.handler = async (event) => {
  const userId = (event.requestContext && event.requestContext.authorizer && event.requestContext.authorizer.userId) || 'default';
  const documentId = event.pathParameters && event.pathParameters.documentId;

  if (event.httpMethod === 'POST' && !documentId) return upload(event, userId);
  if (event.httpMethod === 'GET' && !documentId) return list(userId);
  if (event.httpMethod === 'GET' && documentId) return getOne(documentId, userId);
  return respond(405, { message: 'Method not allowed' });
};

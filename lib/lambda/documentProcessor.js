// Runs on S3 ObjectCreated events under documents/. Reads the object's metadata
// (no download) and marks the matching DynamoDB item PROCESSED.
const { DynamoDBClient, UpdateItemCommand, ConditionalCheckFailedException } = require('@aws-sdk/client-dynamodb');
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');

const db = new DynamoDBClient({});
const s3 = new S3Client({});

exports.handler = async (event) => {
  for (const record of event.Records || []) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const meta = head.Metadata || {};
    if (!meta.documentid || !meta.uploadtimestamp) {
      console.log(JSON.stringify({ msg: 'object has no document metadata, skipped', key }));
      continue;
    }

    try {
      await db.send(new UpdateItemCommand({
        TableName: process.env.DOCUMENTS_TABLE,
        Key: { documentId: { S: meta.documentid }, uploadTimestamp: { N: meta.uploadtimestamp } },
        ConditionExpression: 'attribute_exists(documentId)',
        UpdateExpression: 'SET #s = :s, sizeBytes = :size, contentType = :ct, processedAt = :now',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':s': { S: 'PROCESSED' },
          ':size': { N: String(record.s3.object.size) },
          ':ct': { S: head.ContentType || 'unknown' },
          ':now': { S: new Date().toISOString() },
        },
      }));
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        console.log(JSON.stringify({ msg: 'no matching record, skipped', documentId: meta.documentid }));
        continue;
      }
      throw err; // Lambda retries async events twice, then sends them to the DLQ
    }
  }
};

// Lambda REQUEST authorizer: checks the X-Api-Key header against the API keys table.
// Uses only the AWS SDK v3 clients that ship with the Node.js Lambda runtime.
const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb');

const db = new DynamoDBClient({});

exports.handler = async (event) => {
  const headers = event.headers || {};
  const apiKey = headers['X-Api-Key'] || headers['x-api-key'];
  if (!apiKey) throw new Error('Unauthorized'); // API Gateway answers 401

  const { Item } = await db.send(new GetItemCommand({
    TableName: process.env.API_KEYS_TABLE,
    Key: { apiKey: { S: apiKey } },
  }));
  if (!Item || (Item.active && Item.active.BOOL === false)) throw new Error('Unauthorized');

  const userId = (Item.userId && Item.userId.S) || 'default';
  return {
    principalId: userId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Action: 'execute-api:Invoke', Effect: 'Allow', Resource: event.methodArn }],
    },
    context: { userId },
  };
};

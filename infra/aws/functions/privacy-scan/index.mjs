import { ComprehendClient, DetectPiiEntitiesCommand } from '@aws-sdk/client-comprehend';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { buildSuggestions, findResidualLocalSensitiveData, parseScanRequest, response } from './core.mjs';

const comprehend = new ComprehendClient({});
const dynamodb = new DynamoDBClient({});
const allowedOrigin = process.env.ALLOWED_ORIGIN;
const tableName = process.env.METRICS_TABLE;

export async function handler(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin;
  if (origin !== allowedOrigin) return response(403, { error: 'origin_not_allowed' }, allowedOrigin);
  if (!event?.requestContext?.authorizer?.claims?.sub) return response(401, { error: 'authentication_required' }, allowedOrigin);
  let request;
  try { request = parseScanRequest(event.body); }
  catch (error) { return response(400, { error: 'invalid_request', message: error.message }, allowedOrigin); }
  const residual = findResidualLocalSensitiveData(request.maskedText);
  if (residual.length) return response(422, { error: 'local_scan_required', categories: residual }, allowedOrigin);

  let result;
  try { result = await comprehend.send(new DetectPiiEntitiesCommand({ Text: request.maskedText, LanguageCode: 'en' })); }
  catch { return response(502, { error: 'analysis_unavailable' }, allowedOrigin); }
  const suggestions = buildSuggestions(request.maskedText, result.Entities);
  const day = new Date().toISOString().slice(0, 10);
  try {
    await dynamodb.send(new UpdateItemCommand({
      TableName: tableName,
      Key: { day: { S: day } },
      UpdateExpression: 'ADD scanCount :one, suggestionCount :count SET expiresAt = :expires',
      ExpressionAttributeValues: {
        ':one': { N: '1' },
        ':count': { N: String(suggestions.length) },
        ':expires': { N: String(Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60) }
      }
    }));
  } catch { /* Aggregate metrics must never block a privacy suggestion. */ }
  return response(200, { scanId: request.scanId, suggestions, provider: 'Amazon Comprehend', applicationStoredPrompt: false }, allowedOrigin);
}

# Runbook

Use this page when one of the stack's alarms fires.

## ProcessorErrorAlarm fired

The document processor failed 3 or more times in 5 minutes.

1. Open the `DocumentProcessorFunction` log group in CloudWatch Logs and find the error.
2. Look in the `DocumentProcessorDLQ` queue. Each message is an S3 event that failed three times (the first try and two retries).
3. Common causes:
   - **AccessDenied from S3 or KMS.** Someone changed a role or the key policy. Compare with the stack in git.
   - **Timeout.** Check that the S3 and DynamoDB gateway endpoints are still on the subnets' route tables.
4. Once it's fixed, replay the event by invoking the function with the message body. Records that are already `PROCESSED` just get updated again.

## ApiHandlerErrorAlarm or AuthorizerErrorAlarm fired

1. Open the function's log group and find the error.
2. For `ResourceNotFoundException`, check that the `DOCUMENTS_TABLE`, `API_KEYS_TABLE` and `DOCUMENTS_BUCKET` environment variables match the deployed names.
3. For timeouts, check the endpoints as above.

The DLQs on these two functions stay empty. API Gateway calls them and waits for the answer, and DLQs only receive async failures.

## A client says uploads fail

- **401 or 403:** the key isn't in the `api-keys` table, or the header isn't `X-Api-Key`.
- **400:** the body is missing `fileName` or `content`, or the content type isn't one of `application/pdf`, `image/png`, `image/jpeg` or `text/plain`.
- **413:** the file is too big. Base64 adds about a third, so a file over about 7 MB won't fit in API Gateway's 10 MB limit.

## A document stays at UPLOADED

The processor didn't run or didn't finish. Check `ProcessorErrorAlarm` and the processor logs as described at the top of this page.

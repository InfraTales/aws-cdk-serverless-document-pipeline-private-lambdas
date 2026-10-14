# Cost

These are on-demand prices in us-east-1 from the AWS Price List API, checked on 2026-10-14. Check them again before you rely on them.

## A quiet month (dev or low traffic)

Assume 1,000 uploads of about 1 MB each.

| Item | Math | Monthly |
|---|---|---|
| API Gateway interface endpoint | 2 AZs × $0.01/hr × 730 hours | $14.60 |
| CloudWatch alarms | 5 alarms × $0.10 | $0.50 |
| AWS KMS | 1 customer managed key | $1.00 |
| Amazon S3 | 1 GB × $0.023, plus requests | about $0.03 |
| API Gateway (REST) | about 3,000 requests × $3.50/M | about $0.01 |
| Lambda, DynamoDB, SQS | inside the free tier at this volume | $0.00 |
| **Total** | | **about $16** |

## What drives the bill

- **The interface endpoint is 90% of it.** Nothing in this version calls it, so removing it takes the monthly cost to under $2. The newer repo drops it.
- **No NAT gateway.** Two of them would add about $73 a month, plus $0.045 for every GB they process.
- **Requests and storage grow with traffic.** At 100,000 uploads a month, add about $0.35 for API Gateway, a few dollars of S3 storage, and some Lambda time once you pass the free tier.

## Ways to cut it

- Remove the API Gateway interface endpoint if nothing inside the VPC calls the API.
- Set a retention period on the Lambda log groups. Without one, CloudWatch keeps logs forever.
- Add an S3 lifecycle rule that moves old documents to Standard-IA after 30 days.

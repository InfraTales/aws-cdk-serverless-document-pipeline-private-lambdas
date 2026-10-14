# Troubleshooting

Fixes for problems people hit when they build or deploy this repo.
## `npm run check` fails with "Cannot find module"

Run `npm ci` first. If the error names a file in `lib/lambda/`, pull the latest `main`. Older copies of this repo ignored `*.js`, so the handler files were missing.
## `cdk deploy` asks you to bootstrap

CDK needs a bootstrap stack once per account and Region:

```bash
npx cdk bootstrap aws://YOUR_ACCOUNT_ID/YOUR_REGION
```
## `cdk deploy` fails with AccessDenied

Check which identity you're using:

```bash
aws sts get-caller-identity
```

That identity needs permission to create VPCs, Lambda functions, IAM roles, KMS keys and CloudFormation stacks. CloudTrail shows the exact call AWS denied.
## The stack is stuck in UPDATE_ROLLBACK_FAILED

Open the stack's Events tab in the CloudFormation console and find the first resource that failed. Fix that cause, then choose **Continue update rollback**.
## Lambda logs show a KMS error when writing logs

If you encrypt the log groups with KMS, the key policy has to allow the `logs.<region>.amazonaws.com` service principal. CDK doesn't add that for you.
## Still stuck

Open an [issue](../../issues) with the error message and the command you ran.

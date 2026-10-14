# Security policy
## Reporting a vulnerability

Please don't open a public issue for a security problem. Email **rahul.ladumor@infratales.com** instead and include:

- what the problem is
- the steps to reproduce it
- what an attacker could do with it
- a fix, if you have one

You'll get a first reply within 72 hours.
## Supported versions

Only the latest commit on `main` gets fixes. This repo is the first version of the pipeline, kept for learning. For production use, start from [aws-cdk-private-lambda-document-intake](https://github.com/InfraTales/aws-cdk-private-lambda-document-intake).
## Using this code safely

- Keep AWS credentials and secrets out of git.
- Read [docs/security.md](docs/security.md) for the gaps this version still has.
- Run `cdk diff` before every deploy and check the IAM and security group changes.

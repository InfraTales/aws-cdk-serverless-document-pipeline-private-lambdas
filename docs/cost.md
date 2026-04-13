# Cost Model

## Overview

This is a reference cost model. Actual costs vary by usage, region, and configuration.

## Key Cost Drivers

- Zero NAT Gateways saves ~$65-130/month per AZ but means Lambdas cannot reach any non-AWS internet endpoint — third-party virus scanning, webhook callbacks, or external validation APIs all break silently at runtime unless you add Interface endpoints or redesign the flow. [inferred]
- API Gateway Interface VPC endpoint adds ~$16/month per AZ and roughly 1-2ms of latency per call compared to the public endpoint, but it is the only way to keep the API callable from inside the VPC without internet exposure. [inferred]

## Estimated Monthly Cost

| Component | Dev (₹) | Staging (₹) | Production (₹) |
|-----------|---------|-------------|-----------------|
| Compute   | ₹2,000–5,000 | ₹8,000–15,000 | ₹25,000–60,000 |
| Database  | ₹1,500–3,000 | ₹5,000–12,000 | ₹15,000–40,000 |
| Networking| ₹500–1,000   | ₹2,000–5,000  | ₹5,000–15,000  |
| Monitoring| ₹200–500     | ₹1,000–2,000  | ₹3,000–8,000   |
| **Total** | **₹4,200–9,500** | **₹16,000–34,000** | **₹48,000–1,23,000** |

> Estimates based on ap-south-1 (Mumbai) pricing. Actual costs depend on traffic, data volume, and reserved capacity.

## Cost Optimization Strategies

- Use Savings Plans or Reserved Instances for predictable workloads
- Enable auto-scaling with conservative scale-in policies
- Use DynamoDB on-demand for dev, provisioned for production
- Leverage S3 Intelligent-Tiering for infrequently accessed data
- Review Cost Explorer weekly for anomalies

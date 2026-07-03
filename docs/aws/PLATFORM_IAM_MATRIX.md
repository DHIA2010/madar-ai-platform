# MADAR Stage Platform - IAM Role Matrix

## Overview

This document details all IAM roles created by the `stage-platform` stack and their permissions.

---

## ECS Task Execution Role

**Name:** `madar-stage-ecs-task-execution-role`  
**Created by:** `aws_iam_role.ecs_task_execution_role`  
**Trust Relationship:** `ecs-tasks.amazonaws.com`

### Purpose
This role allows the ECS service to perform container lifecycle operations on behalf of your tasks.

### Policies Attached

#### 1. AWS Managed Policy: AmazonECSTaskExecutionRolePolicy
**ARN:** `arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy`

**Permissions:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer"
      ],
      "Resource": "arn:aws:ecr:eu-central-1:<ACCOUNT_ID>:repository/*"
    },
    {
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    }
  ]
}
```

#### 2. Custom Inline Policy: ecs-task-execution-ecr-cloudwatch
**Name:** `madar-stage-ecs-task-execution-ecr-cloudwatch`

**Permissions:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchCheckLayerAvailability"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": [
        "arn:aws:logs:eu-central-1:<ACCOUNT_ID>:log-group:/aws/ecs/madar-stage-frontend",
        "arn:aws:logs:eu-central-1:<ACCOUNT_ID>:log-group:/aws/ecs/madar-stage-backend"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": [
        "arn:aws:secretsmanager:eu-central-1:<ACCOUNT_ID>:secret:madar-stage/frontend-session-secret*"
      ]
    }
  ]
}
```

### What This Role Can Do
- ✅ Pull images from ECR
- ✅ Create log streams in CloudWatch
- ✅ Write logs to CloudWatch
- ✅ Fetch secrets from Secrets Manager
- ✅ Authenticate with ECR

### What This Role CANNOT Do
- ❌ Invoke Lambda functions
- ❌ Write to S3
- ❌ Call other AWS services
- ❌ Delete resources
- ❌ Modify IAM policies

---

## ECS Task Runtime Role

**Name:** `madar-stage-ecs-task-role`  
**Created by:** `aws_iam_role.ecs_task_role`  
**Trust Relationship:** `ecs-tasks.amazonaws.com`

### Purpose
This role is attached to running ECS tasks and defines what AWS APIs the application code can call.

### Policies Attached

**None by default (intentionally empty)**

### What This Role Can Do
- ✅ Run application code in ECS tasks
- ❌ Call ANY AWS APIs (no permissions)

### Extension Points (For Future Sprints)

As the platform evolves, this role can be extended with:

**For Async Processing (if using SQS):**
```json
{
  "Effect": "Allow",
  "Action": [
    "sqs:SendMessage",
    "sqs:ReceiveMessage",
    "sqs:DeleteMessage",
    "sqs:GetQueueAttributes"
  ],
  "Resource": "arn:aws:sqs:eu-central-1:<ACCOUNT_ID>:madar-stage-*"
}
```

**For Caching (if using Redis via Secrets Manager):**
```json
{
  "Effect": "Allow",
  "Action": "secretsmanager:GetSecretValue",
  "Resource": "arn:aws:secretsmanager:eu-central-1:<ACCOUNT_ID>:secret:madar-stage/redis-*"
}
```

**For Analytics (if using Kinesis):**
```json
{
  "Effect": "Allow",
  "Action": [
    "kinesis:PutRecord",
    "kinesis:PutRecords"
  ],
  "Resource": "arn:aws:kinesis:eu-central-1:<ACCOUNT_ID>:stream/madar-stage-*"
}
```

---

## Comparison Table

| Capability | Task Execution | Task Runtime |
|-----------|-----------------|--------------|
| **Trust Principal** | ecs-tasks.amazonaws.com | ecs-tasks.amazonaws.com |
| **Purpose** | Container lifecycle | Application runtime |
| **ECR Pull** | ✅ Yes | ❌ No |
| **CloudWatch Logs** | ✅ Yes | ❌ No |
| **Secrets Manager** | ✅ Yes (limited) | ❌ No |
| **Application APIs** | ❌ No | ❌ No (by design) |
| **User-Defined** | ❌ AWS Managed (mostly) | ✅ Custom (empty) |

---

## Least Privilege Validation

### ✅ Task Execution Role
- Scoped to ECR repositories: `ecr.eu-central-1.amazonaws.com`
- Scoped to log groups: Only frontend and backend logs
- Scoped to secrets: Only frontend session secret
- Resource-specific (not wildcard) wherever possible
- Default deny on everything else

### ✅ Task Runtime Role
- Completely empty (no permissions)
- Can be extended per-service as needed
- Prevents runaway privilege escalation
- Requires explicit approval for new capabilities

---

## Access Control Matrix

### Who Can Assume These Roles?

**ECS Task Execution Role:**
- ECS Service → ECS Agent (automatic)
- Cannot be assumed manually
- Cannot be assumed by human users

**ECS Task Runtime Role:**
- Application code running in ECS tasks (automatic)
- Cannot be assumed manually
- Cannot be assumed by human users

### Cross-Account Access

**Current (Stage):**
- Roles are single-account (eu-central-1 only)
- No cross-account trust relationships
- Suitable for Stage isolation

**For Production:**
- May require cross-account logging
- May require cross-account deployment
- Would need separate prod-specific roles

---

## Monitoring & Auditing

### CloudTrail Events to Monitor

**Task Execution Role:**
- `GetAuthorizationToken` - ECR authentication attempts
- `BatchGetImage` - Image pull attempts
- `GetSecretValue` - Secret access
- `PutLogEvents` - Unusual logging patterns

**Task Runtime Role:**
- Any access (should be empty, so no activity expected)

### CloudWatch Metrics

- Monitor task launch success rate (via CloudTrail)
- Monitor secret access failures
- Monitor ECR pull errors (in ECS task state changes)

### Recommended Alarms

1. **Task Execution Role Secret Access**
   ```
   CloudTrail event: secretsmanager:GetSecretValue
   Baseline: Normal production usage
   Alert: If exceeds baseline by 10x
   ```

2. **Task Execution Role ECR Failures**
   ```
   CloudTrail event: ecr:BatchGetImage with error
   Baseline: 0 expected
   Alert: If exceeds 3 in 5 minutes
   ```

3. **Unauthorized Access to Task Runtime Role**
   ```
   CloudTrail event: AssumeRole for task-role
   Baseline: Via ECS service only
   Alert: If any other principal attempts
   ```

---

## Security Best Practices Applied

1. ✅ **Least Privilege:** Task runtime role starts empty
2. ✅ **Separation of Concerns:** Execution vs. Runtime roles distinct
3. ✅ **Resource Scoping:** Specific to stage resources only
4. ✅ **No Wildcard Paths:** Specific ARNs where possible
5. ✅ **Immutable Permissions:** AWS managed policy for execution
6. ✅ **Audit Trail:** CloudTrail enabled by default (from bootstrap)
7. ✅ **No Long-Term Credentials:** IAM roles use temporary STS tokens

---

## Migration Path (Production)

For production deployment, new roles will be needed:

**`madar-prod-ecs-task-execution-role`**
- Same structure as stage
- Scoped to prod resources only
- Separate from stage role

**`madar-prod-ecs-task-role`**
- Extended with production service permissions
- Database access (if applicable)
- Monitoring/tracing (X-Ray, Datadog, etc.)
- Cache layer (Redis)
- Message queue (SQS/SNS)

---

## Testing Role Permissions

### Test Task Execution Role
```bash
# Get role info
aws iam get-role --role-name madar-stage-ecs-task-execution-role

# List attached policies
aws iam list-attached-role-policies --role-name madar-stage-ecs-task-execution-role

# Get policy details
aws iam get-role-policy --role-name madar-stage-ecs-task-execution-role --policy-name madar-stage-ecs-task-execution-ecr-cloudwatch
```

### Simulate Policy (Dry-run)
```bash
# Check if role can perform GetSecretValue
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::<ACCOUNT_ID>:role/madar-stage-ecs-task-execution-role \
  --action-names secretsmanager:GetSecretValue \
  --resource-arns "arn:aws:secretsmanager:eu-central-1:<ACCOUNT_ID>:secret:madar-stage/frontend-session-secret*"
```

### Validate from CloudTrail
```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=madar-stage-ecs-task-execution-role \
  --max-results 10
```

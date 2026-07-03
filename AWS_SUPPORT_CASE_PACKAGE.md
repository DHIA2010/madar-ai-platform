# AWS Support Case Package

## 1) Paste-Ready AWS Support Case

### Summary
Production-impacting account-level block in eu-central-1 prevents EC2 and ECS capacity allocation. ECS service cannot place Fargate tasks and EC2 RunInstances returns account blocked.

### Problem Description
We have completed a full infrastructure and platform diagnostic for our stage environment and confirmed this is not caused by configuration drift, IAM policy misconfiguration, networking misconfiguration, image availability, or Terraform deployment errors.

Current blocker:
- ECS service event repeatedly reports: (service madar-stage-app-service) was unable to place a task because your account is currently blocked.
- EC2 launch attempts return: Blocked. This account is currently blocked and not recognized as a valid account.

This indicates an AWS account-level restriction affecting compute provisioning in region eu-central-1.

### AWS Account ID
160450753643

### Region
eu-central-1

### Services Involved
- Amazon ECS (Fargate)
- Amazon EC2 (RunInstances path for control verification)
- Elastic Load Balancing (ALB target registration impact)
- Amazon ECR (image source)
- IAM (task execution role and trust)
- VPC networking (subnets, routes, NAT, security groups)
- CloudWatch Logs
- Terraform (infrastructure state and apply path)

### Environment
- Environment: Stage
- ECS Cluster: madar-stage-cluster
- ECS Service: madar-stage-app-service
- Task Definition: madar-stage-app:1
- Launch Type: FARGATE
- Network Mode: awsvpc
- Subnets: subnet-0f4f928613208da2e, subnet-0da50748916fd0508
- Security Group: sg-051db4f2b9ce2d62a
- Target Group: madar-stage-tg
- ECR Image: 160450753643.dkr.ecr.eu-central-1.amazonaws.com/madar-stage/app:latest

### Expected Behavior
- ECS should place and start one healthy Fargate task for madar-stage-app-service.
- Task should register in ALB target group and pass health checks.
- Service should stabilize at desiredCount=1 and runningCount=1.

### Actual Behavior
- ECS service remains active but cannot place tasks.
- ECS repeatedly emits account blocked placement events.
- EC2 compute launch path also reports account blocked.
- No task remains running; ALB target group has no registered healthy targets.

### Business Impact
- Stage environment is unavailable for deployment validation and release readiness checks.
- Integration and regression verification are blocked.
- Delivery confidence for production promotion is reduced.
- Ongoing engineering and QA activities are delayed due to inability to run workload capacity.

### Timeline
- 2026-06-24 14:38:16 (+03): ECS service started one task.
- 2026-06-24 14:39:40 (+03): Service emitted CannotPullContainerError event for image manifest.
- 2026-06-24 14:40:12 (+03): First account blocked placement event appears.
- 2026-06-24 14:41:16 (+03): Deployment marked failed.
- 2026-06-24 14:47:13 (+03): New deployment attempt initiated.
- 2026-06-24 14:47:19 (+03): Account blocked placement event repeated.
- 2026-06-24 15:34 (+03): Direct ecs:RunTask diagnostic reproduces BlockedException.

### Evidence
- ECS error (exact):
  (service madar-stage-app-service) was unable to place a task because your account is currently blocked.
- EC2 error (exact):
  Blocked
  This account is currently blocked and not recognized as a valid account.
- Direct API diagnostic (ecs:RunTask):
  BlockedException: Your account is currently blocked.

### Requested Action
Please investigate and remove the account-level block affecting compute provisioning in eu-central-1.

Requested from AWS Support:
1. Confirm the precise restriction type applied to account 160450753643 (billing hold, verification hold, fraud/risk hold, compliance hold, or regional restriction).
2. Confirm why ECS Fargate placement and EC2 RunInstances are blocked while foundational services remain accessible.
3. Lift the block or provide exact remediation steps and required account actions.
4. Confirm when compute provisioning will be restored and any post-remediation verification steps.

---

## 2) Technical Appendix

### A. ECS Service Events (Key Excerpts)
- 2026-06-24 14:47:19 (+03)
  (service madar-stage-app-service) was unable to place a task because your account is currently blocked.
- 2026-06-24 14:41:16 (+03)
  (service madar-stage-app-service) (deployment ecs-svc/5461430053932792014) deployment failed: deployment failure.
- 2026-06-24 14:40:12 (+03)
  (service madar-stage-app-service) was unable to place a task because your account is currently blocked.
- 2026-06-24 14:39:40 (+03)
  (service madar-stage-app-service) was unable to place a task. Reason: CannotPullContainerError ... image ... latest: not found.
- 2026-06-24 14:38:16 (+03)
  (service madar-stage-app-service) has started 1 tasks: (task ed09f1c106f1420596cf7c320d6f74a2).

### B. EC2 RunInstances Error (Confirmed)
- Error:
  Blocked
  This account is currently blocked and not recognized as a valid account.

### C. Terraform Status (Verified Working)
- Terraform-managed resources are present and queryable.
- Stage networking, ECS, IAM, and ALB resources are provisioned and discoverable.
- No evidence of missing foundational infrastructure from Terraform outputs/state used in diagnostics.

### D. ECS Cluster Status
- Cluster: madar-stage-cluster
- Cluster status: ACTIVE
- Capacity providers: FARGATE ACTIVE, FARGATE_SPOT ACTIVE
- Service: madar-stage-app-service
- Desired count: 1
- Running count: 0
- Deployment history shows failed rollout and repeated blocked placement events.

### E. IAM Verification
- Execution role exists: madar-stage-ecs-task-execution-role
- Managed policy attached: AmazonECSTaskExecutionRolePolicy
- Trust relationship valid for ecs-tasks.amazonaws.com
- Inline execution permissions include ECR pull, CloudWatch logs write, Secrets Manager get-secret
- Task role exists: madar-stage-ecs-task-role
- Trust relationship valid for ecs-tasks.amazonaws.com

### F. Networking Verification
- VPC available and DNS hostnames enabled
- Private subnets configured across two AZs
- NAT gateway present and routes for outbound 0.0.0.0/0 confirmed from private route tables
- Internet gateway attached to VPC
- Task security group allows inbound app port from ALB SG and allows outbound internet egress
- AssignPublicIp disabled (consistent with private subnet plus NAT design)

### G. ECR Verification
- Repository exists: madar-stage/app
- Image tag exists: latest
- Image recently pushed and retrievable by API
- ECR authorization token retrieval successful

### H. ALB Verification
- Target group exists: madar-stage-tg
- Health check configured
- Registered targets: 0 during incident window (consistent with no running tasks)

---

## 3) Troubleshooting Timeline (Complete Verification Sequence)

1. Verified caller identity and account access context for account 160450753643.
2. Checked ECS service and deployment state; observed desiredCount=1 with runningCount=0 and blocked placement events.
3. Queried stopped/running task sets to confirm no stable task remained active.
4. Inspected task definition for execution role, task role, image URI, logging, cpu/memory, network mode, and launch compatibility.
5. Validated ECS cluster health and capacity provider status (FARGATE and FARGATE_SPOT active).
6. Verified IAM execution role existence, attached managed policy, trust policy, and inline permissions.
7. Verified IAM task role existence and trust policy.
8. Verified VPC, private subnet properties, route tables, NAT gateway, and IGW attachment.
9. Verified security group ingress/egress rules for app and outbound access.
10. Verified ECR repository and image tag availability and ECR auth token retrieval.
11. Verified CloudWatch log group presence and logging configuration in task definition.
12. Verified ALB target group configuration and observed no registered targets while placement failed.
13. Executed direct ecs:RunTask diagnostic and reproduced BlockedException: Your account is currently blocked.
14. Confirmed separate EC2 compute path is also blocked via RunInstances error: account is currently blocked and not recognized as a valid account.
15. Consolidated findings: foundational services are available; compute provisioning paths are account-blocked.

---

## 4) Executive Summary for AWS Support Engineers

We performed end-to-end diagnostics in account 160450753643, region eu-central-1, for stage service madar-stage-app-service on ECS Fargate. Infrastructure is healthy and correctly configured (IAM, VPC, networking, ECR, ALB, CloudWatch, Terraform-managed resources). Despite this, compute provisioning is blocked at account level.

Two independent compute paths fail with account-block signals:
- ECS: service event reports account blocked during task placement.
- EC2: RunInstances reports account blocked and account not recognized as valid.

Please identify the exact account restriction class in effect, remove or resolve the block, and confirm restoration steps/timeline for ECS Fargate and EC2 provisioning in eu-central-1.

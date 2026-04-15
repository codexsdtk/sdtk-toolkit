
# IaC Patterns

## Overview

These examples capture common infrastructure-as-code patterns for a networked service with autoscaling, load balancing, and operational safeguards. Treat provider-specific syntax as illustrative. The planning pattern is portable even when the resource names differ.

## Network And Compute Pattern

```hcl
module "network" {
  source = "./modules/network"

  name               = "app-prod"
  cidr_block         = "10.20.0.0/16"
  public_subnets     = ["10.20.1.0/24", "10.20.2.0/24"]
  private_subnets    = ["10.20.11.0/24", "10.20.12.0/24"]
  enable_nat_gateway = true
}

resource "aws_launch_template" "app" {
  name_prefix   = "app-prod-"
  image_id      = var.image_id
  instance_type = var.instance_type

  user_data = base64encode(templatefile("${path.module}/bootstrap.sh", {
    env = "production"
  }))
}

resource "aws_autoscaling_group" "app" {
  name                = "app-prod"
  desired_capacity    = 3
  min_size            = 3
  max_size            = 6
  vpc_zone_identifier = module.network.private_subnet_ids
  target_group_arns   = [aws_lb_target_group.app.arn]
  health_check_type   = "ELB"
  health_check_grace_period = 300

  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }
}
```

Pattern notes:
- keep shared network concerns in a module
- treat image version and instance size as explicit inputs
- set min and max capacity in the same change that introduces autoscaling
- attach compute to health-checked traffic entry, not direct public access

## Load Balancer Pattern

```hcl
resource "aws_lb" "app" {
  name               = "app-prod"
  internal           = false
  load_balancer_type = "application"
  subnets            = module.network.public_subnet_ids
  security_groups    = [aws_security_group.lb.id]
}

resource "aws_lb_target_group" "app" {
  name     = "app-prod"
  port     = 8080
  protocol = "HTTP"
  vpc_id   = module.network.vpc_id

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
  }
}
```

Pattern notes:
- define health checks next to the traffic entry resource
- use explicit thresholds instead of provider defaults
- keep listener, target, and security policy changes in the same reviewed plan

## Database Pattern

```hcl
resource "aws_db_subnet_group" "app" {
  name       = "app-prod"
  subnet_ids = module.network.private_subnet_ids
}

resource "aws_db_instance" "app" {
  identifier              = "app-prod"
  engine                  = "postgres"
  instance_class          = "db.t3.medium"
  allocated_storage       = 100
  storage_encrypted       = true
  backup_retention_period = 7
  multi_az                = true
  db_subnet_group_name    = aws_db_subnet_group.app.name
  vpc_security_group_ids  = [aws_security_group.db.id]
}
```

Pattern notes:
- keep stateful resources private by default
- define backup retention and encryption in the first version
- make high availability an explicit decision, not an accident

## Alarm Pattern

```hcl
resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  alarm_name          = "app-prod-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 75
  alarm_description   = "CPU high for two consecutive periods"
}
```

Pattern notes:
- define an alarm when you define the critical resource
- use thresholds the team can explain and review
- connect alerting design to rollback and incident response decisions

## Planning Checklist

Before applying an IaC change, confirm:
- all provider-specific examples have a cloud-agnostic rationale
- network, identity, and secret dependencies are listed
- rollback covers both failed create and partial update
- health checks, alarms, and backups are defined with the resource

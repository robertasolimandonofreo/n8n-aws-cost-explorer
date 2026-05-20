# n8n-nodes-aws-cost-explorer

n8n community node for AWS Cost Explorer — retrieve cost, usage, anomalies, and purchase recommendations.

## Installation

Settings → Community Nodes → Install → `n8n-nodes-aws-cost-explorer-rsd`

## Credentials

| Field | Required | Description |
|---|---|---|
| AWS Access Key ID | ✅ | IAM access key |
| AWS Secret Access Key | ✅ | IAM secret key |
| Session Token | ❌ | STS temporary token (for AssumeRole) |
| Region | ✅ | `us-east-1` recommended |

## IAM Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "ce:GetCostAndUsage",
      "ce:GetCostForecast",
      "ce:GetDimensionValues",
      "ce:GetReservationUtilization",
      "ce:GetReservationCoverage",
      "ce:GetReservationPurchaseRecommendation",
      "ce:GetSavingsPlansUtilization",
      "ce:GetSavingsPlansCoverage",
      "ce:GetSavingsPlansPurchaseRecommendation",
      "ce:GetAnomalies",
      "ce:GetAnomalyMonitors",
      "ce:GetAnomalySubscriptions"
    ],
    "Resource": "*"
  }]
}
```

## Resources & Operations

### Cost and Usage
- **Get** — Retrieves cost and usage data for a time period.

Options:
- **Granularity**: Daily / Monthly / Hourly
- **Metrics**: UnblendedCost, BlendedCost, AmortizedCost, NetUnblendedCost, NetAmortizedCost, UsageQuantity, NormalizedUsageAmount
- **Group By**: Service, Linked Account, Region, Purchase Type, Instance Type, Usage Type, Tag
- **Secondary Group By**: additional grouping dimension (max 2 supported by AWS)
- **Filter by Service(s)**: comma-separated list (e.g. `Amazon EC2, Amazon S3`)
- **Filter by Linked Account(s)**: comma-separated account IDs
- **Filter by Region(s)**: comma-separated region codes
- **Filter by Tag**: key + comma-separated values
- **Exclude Credits & Refunds**: removes Credit/Refund/Discount record types
- **Format Output**: flattens AWS response into simple rows with numeric amounts
- **Pagination**: automatic — all pages are fetched and merged

### Cost Forecast
- **Get** — Retrieves cost forecast for a future time period.

### Dimension Values
- **Get** — Lists available values for a dimension (Service, Region, Linked Account, etc.)

### Reserved Instances
- **Get Utilization** — RI hours used vs purchased, grouped by service (optional)
- **Get Coverage** — % of usage covered by RIs
- **Get Recommendations** — Purchase recommendations for EC2, RDS, ElastiCache, Redshift, ES

### Savings Plans
- **Get Utilization** — SP commitment used vs wasted
- **Get Coverage** — % of usage covered by SPs
- **Get Recommendations** — Purchase recommendations for Compute SP, EC2 Instance SP, SageMaker SP

### Cost Anomaly Detection
- **Get Anomalies** — Detected cost spikes with optional minimum impact filter
- **Get Monitors** — Configured anomaly monitors
- **Get Subscriptions** — Alert subscriptions for anomaly notifications

## Output Format

By default the node returns the raw AWS API response.

When **Format Output** is enabled on `Cost and Usage`, results are flattened into one row per group per period:

```json
{
  "start": "2024-01-01",
  "end": "2024-01-02",
  "estimated": false,
  "keys": ["Amazon EC2"],
  "UnblendedCost_amount": 42.5,
  "UnblendedCost_unit": "USD"
}
```
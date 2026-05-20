import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

import { NodeOperationError } from 'n8n-workflow';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function csvToList(raw: string): string[] {
	return raw
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

function buildDimensionFilter(key: string, values: string[]): object {
	return { Dimensions: { Key: key, Values: values } };
}

function buildTagFilter(key: string, values: string[]): object {
	return { Tags: { Key: key, Values: values } };
}

function mergeFilters(conditions: object[]): object | undefined {
	if (conditions.length === 0) return undefined;
	if (conditions.length === 1) return conditions[0];
	return { And: conditions };
}

/** Collect all pages from a Cost Explorer call that returns NextPageToken */
async function paginate<T>(
	fn: (token?: string) => Promise<{ results: T[]; nextToken?: string }>,
): Promise<T[]> {
	const all: T[] = [];
	let token: string | undefined;
	do {
		const { results, nextToken } = await fn(token);
		all.push(...results);
		token = nextToken;
	} while (token);
	return all;
}

/** Flatten ResultsByTime into simple rows */
function flattenCostResults(
	resultsByTime: any[],
	metrics: string[],
): IDataObject[] {
	const rows: IDataObject[] = [];
	for (const period of resultsByTime) {
		const base: IDataObject = {
			start: period.TimePeriod?.Start,
			end: period.TimePeriod?.End,
			estimated: period.Estimated ?? false,
		};
		if (period.Groups && period.Groups.length > 0) {
			for (const group of period.Groups) {
				const row: IDataObject = { ...base, keys: group.Keys };
				for (const metric of metrics) {
					const m = group.Metrics?.[metric];
					if (m) row[`${metric}_amount`] = parseFloat(m.Amount);
					if (m) row[`${metric}_unit`] = m.Unit;
				}
				rows.push(row);
			}
		} else {
			const row: IDataObject = { ...base };
			for (const metric of metrics) {
				const m = period.Total?.[metric];
				if (m) row[`${metric}_amount`] = parseFloat(m.Amount);
				if (m) row[`${metric}_unit`] = m.Unit;
			}
			rows.push(row);
		}
	}
	return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Node definition
// ─────────────────────────────────────────────────────────────────────────────

export class AwsCostExplorer implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'AWS Cost Explorer',
		name: 'awsCostExplorer',
		icon: 'file:awscostexplorer.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description: 'Retrieve cost, usage, anomalies and recommendations from AWS Cost Explorer',
		defaults: { name: 'AWS Cost Explorer' },
		inputs: ['main'] as any,
		outputs: ['main'] as any,
		credentials: [{ name: 'awsCostExplorerApi', required: true }],
		properties: [
			// ── Resource ──────────────────────────────────────────────────────
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Cost Anomaly Detection',  value: 'anomaly' },
					{ name: 'Cost and Usage',          value: 'costAndUsage' },
					{ name: 'Cost Forecast',           value: 'costForecast' },
					{ name: 'Dimension Values',        value: 'dimensionValues' },
					{ name: 'Reserved Instances',      value: 'reservedInstances' },
					{ name: 'Savings Plans',           value: 'savingsPlans' },
				],
				default: 'costAndUsage',
			},

			// ── Operations ────────────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['costAndUsage'] } },
				options: [
					{ name: 'Get', value: 'get', action: 'Get cost and usage data' },
				],
				default: 'get',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['costForecast'] } },
				options: [
					{ name: 'Get', value: 'get', action: 'Get cost forecast' },
				],
				default: 'get',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['dimensionValues'] } },
				options: [
					{ name: 'Get', value: 'get', action: 'Get dimension values' },
				],
				default: 'get',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['reservedInstances'] } },
				options: [
					{ name: 'Get Coverage',        value: 'getCoverage',        action: 'Get RI coverage' },
					{ name: 'Get Recommendations', value: 'getRecommendations', action: 'Get RI purchase recommendations' },
					{ name: 'Get Utilization',     value: 'getUtilization',     action: 'Get RI utilization' },
				],
				default: 'getUtilization',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['savingsPlans'] } },
				options: [
					{ name: 'Get Coverage',        value: 'getCoverage',        action: 'Get SP coverage' },
					{ name: 'Get Recommendations', value: 'getRecommendations', action: 'Get SP purchase recommendations' },
					{ name: 'Get Utilization',     value: 'getUtilization',     action: 'Get SP utilization' },
				],
				default: 'getUtilization',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['anomaly'] } },
				options: [
					{ name: 'Get Anomalies',       value: 'getAnomalies',      action: 'Get cost anomalies' },
					{ name: 'Get Monitors',        value: 'getMonitors',       action: 'Get anomaly monitors' },
					{ name: 'Get Subscriptions',   value: 'getSubscriptions',  action: 'Get anomaly subscriptions' },
				],
				default: 'getAnomalies',
			},

			// ── Shared: Date range ────────────────────────────────────────────
			{
				displayName: 'Start Date',
				name: 'startDate',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['costAndUsage', 'costForecast', 'dimensionValues', 'reservedInstances', 'savingsPlans'],
						operation: ['get', 'getUtilization', 'getCoverage'],
					},
				},
				default: '',
				placeholder: '2024-01-01',
				description: 'Start date in YYYY-MM-DD format',
				required: true,
			},
			{
				displayName: 'End Date',
				name: 'endDate',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['costAndUsage', 'costForecast', 'dimensionValues', 'reservedInstances', 'savingsPlans'],
						operation: ['get', 'getUtilization', 'getCoverage'],
					},
				},
				default: '',
				placeholder: '2024-01-31',
				description: 'End date in YYYY-MM-DD format (exclusive)',
				required: true,
			},

			// ── Anomaly: date range ───────────────────────────────────────────
			{
				displayName: 'Start Date',
				name: 'anomalyStartDate',
				type: 'string',
				displayOptions: {
					show: { resource: ['anomaly'], operation: ['getAnomalies'] },
				},
				default: '',
				placeholder: '2024-01-01',
				description: 'Anomaly date range start (YYYY-MM-DD)',
				required: true,
			},
			{
				displayName: 'End Date',
				name: 'anomalyEndDate',
				type: 'string',
				displayOptions: {
					show: { resource: ['anomaly'], operation: ['getAnomalies'] },
				},
				default: '',
				placeholder: '2024-01-31',
				description: 'Anomaly date range end (YYYY-MM-DD)',
				required: true,
			},
			{
				displayName: 'Minimum Impact (USD)',
				name: 'anomalyMinImpact',
				type: 'number',
				displayOptions: {
					show: { resource: ['anomaly'], operation: ['getAnomalies'] },
				},
				default: 0,
				description: 'Only return anomalies with total impact above this amount in USD (0 = all)',
			},

			// ── Granularity ───────────────────────────────────────────────────
			{
				displayName: 'Granularity',
				name: 'granularity',
				type: 'options',
				displayOptions: { show: { resource: ['costAndUsage'], operation: ['get'] } },
				options: [
					{ name: 'Daily',   value: 'DAILY' },
					{ name: 'Hourly',  value: 'HOURLY' },
					{ name: 'Monthly', value: 'MONTHLY' },
				],
				default: 'MONTHLY',
			},
			{
				displayName: 'Granularity',
				name: 'granularity',
				type: 'options',
				displayOptions: { show: { resource: ['costForecast'], operation: ['get'] } },
				options: [
					{ name: 'Daily',   value: 'DAILY' },
					{ name: 'Monthly', value: 'MONTHLY' },
				],
				default: 'MONTHLY',
			},
			{
				displayName: 'Granularity',
				name: 'granularity',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['reservedInstances', 'savingsPlans'],
						operation: ['getUtilization', 'getCoverage'],
					},
				},
				options: [
					{ name: 'Daily',   value: 'DAILY' },
					{ name: 'Monthly', value: 'MONTHLY' },
				],
				default: 'MONTHLY',
			},

			// ── Cost and Usage: Metrics ───────────────────────────────────────
			{
				displayName: 'Metrics',
				name: 'metrics',
				type: 'multiOptions',
				displayOptions: { show: { resource: ['costAndUsage'], operation: ['get'] } },
				options: [
					{ name: 'Amortized Cost',          value: 'AmortizedCost' },
					{ name: 'Blended Cost',            value: 'BlendedCost' },
					{ name: 'Net Amortized Cost',      value: 'NetAmortizedCost' },
					{ name: 'Net Unblended Cost',      value: 'NetUnblendedCost' },
					{ name: 'Normalized Usage Amount', value: 'NormalizedUsageAmount' },
					{ name: 'Unblended Cost',          value: 'UnblendedCost' },
					{ name: 'Usage Quantity',          value: 'UsageQuantity' },
				],
				default: ['UnblendedCost'],
			},

			// ── Forecast: Metric ──────────────────────────────────────────────
			{
				displayName: 'Metric',
				name: 'forecastMetric',
				type: 'options',
				displayOptions: { show: { resource: ['costForecast'], operation: ['get'] } },
				options: [
					{ name: 'Amortized Cost',     value: 'AMORTIZED_COST' },
					{ name: 'Blended Cost',       value: 'BLENDED_COST' },
					{ name: 'Net Amortized Cost', value: 'NET_AMORTIZED_COST' },
					{ name: 'Net Unblended Cost', value: 'NET_UNBLENDED_COST' },
					{ name: 'Unblended Cost',     value: 'UNBLENDED_COST' },
				],
				default: 'UNBLENDED_COST',
			},

			// ── Cost and Usage: Group By ──────────────────────────────────────
			{
				displayName: 'Group By',
				name: 'groupBy',
				type: 'options',
				displayOptions: { show: { resource: ['costAndUsage'], operation: ['get'] } },
				options: [
					{ name: 'None',           value: 'none' },
					{ name: 'Instance Type',  value: 'INSTANCE_TYPE' },
					{ name: 'Linked Account', value: 'LINKED_ACCOUNT' },
					{ name: 'Purchase Type',  value: 'PURCHASE_TYPE' },
					{ name: 'Region',         value: 'REGION' },
					{ name: 'Service',        value: 'SERVICE' },
					{ name: 'Tag',            value: 'TAG' },
					{ name: 'Usage Type',     value: 'USAGE_TYPE' },
				],
				default: 'none',
				description: 'Primary dimension to group costs by',
			},
			{
				displayName: 'Tag Key (Group By)',
				name: 'groupByTagKey',
				type: 'string',
				displayOptions: {
					show: { resource: ['costAndUsage'], operation: ['get'], groupBy: ['TAG'] },
				},
				default: '',
				placeholder: 'Environment',
				description: 'Tag key to group costs by',
				required: true,
			},
			{
				displayName: 'Secondary Group By',
				name: 'groupBySecondary',
				type: 'options',
				displayOptions: {
					show: { resource: ['costAndUsage'], operation: ['get'] },
					hide: { groupBy: ['none'] },
				},
				options: [
					{ name: 'None',           value: 'none' },
					{ name: 'Instance Type',  value: 'INSTANCE_TYPE' },
					{ name: 'Linked Account', value: 'LINKED_ACCOUNT' },
					{ name: 'Purchase Type',  value: 'PURCHASE_TYPE' },
					{ name: 'Region',         value: 'REGION' },
					{ name: 'Service',        value: 'SERVICE' },
				],
				default: 'none',
				description: 'Secondary grouping dimension (AWS supports max 2)',
			},

			// ── Cost and Usage: Filters ───────────────────────────────────────
			{
				displayName: 'Filter by Service(s)',
				name: 'serviceFilter',
				type: 'string',
				displayOptions: { show: { resource: ['costAndUsage'], operation: ['get'] } },
				default: '',
				placeholder: 'Amazon EC2, Amazon S3',
				description: 'Comma-separated list of AWS service names to filter by',
			},
			{
				displayName: 'Filter by Linked Account(s)',
				name: 'linkedAccountFilter',
				type: 'string',
				displayOptions: { show: { resource: ['costAndUsage'], operation: ['get'] } },
				default: '',
				placeholder: '123456789012, 987654321098',
				description: 'Comma-separated list of linked account IDs to filter by',
			},
			{
				displayName: 'Filter by Region(s)',
				name: 'regionFilter',
				type: 'string',
				displayOptions: { show: { resource: ['costAndUsage'], operation: ['get'] } },
				default: '',
				placeholder: 'us-east-1, eu-west-1',
				description: 'Comma-separated list of AWS regions to filter by',
			},
			{
				displayName: 'Filter by Tag',
				name: 'tagFilter',
				type: 'fixedCollection',
				displayOptions: { show: { resource: ['costAndUsage'], operation: ['get'] } },
				default: {},
				description: 'Filter by a tag key and one or more values',
				options: [
					{
						name: 'values',
						displayName: 'Tag Filter',
						values: [
							{
								displayName: 'Tag Key',
								name: 'key',
								type: 'string',
								default: '',
								placeholder: 'Environment',
							},
							{
								displayName: 'Tag Value(s)',
								name: 'value',
								type: 'string',
								default: '',
								placeholder: 'production, staging',
								description: 'Comma-separated tag values',
							},
						],
					},
				],
			},
			{
				displayName: 'Exclude Credits & Refunds',
				name: 'excludeCredits',
				type: 'boolean',
				displayOptions: { show: { resource: ['costAndUsage'], operation: ['get'] } },
				default: false,
				description: 'Whether to exclude credits, refunds and discounts from results',
			},
			{
				displayName: 'Format Output',
				name: 'formatOutput',
				type: 'boolean',
				displayOptions: { show: { resource: ['costAndUsage'], operation: ['get'] } },
				default: false,
				description: 'Whether to flatten the AWS response into simple rows with numeric amounts',
			},

			// ── Dimension Values ──────────────────────────────────────────────
			{
				displayName: 'Dimension',
				name: 'dimension',
				type: 'options',
				displayOptions: { show: { resource: ['dimensionValues'], operation: ['get'] } },
				options: [
					{ name: 'AZ',                 value: 'AZ' },
					{ name: 'Instance Type',       value: 'INSTANCE_TYPE' },
					{ name: 'Legal Entity Name',   value: 'LEGAL_ENTITY_NAME' },
					{ name: 'Linked Account',      value: 'LINKED_ACCOUNT' },
					{ name: 'Operating System',    value: 'OPERATING_SYSTEM' },
					{ name: 'Operation',           value: 'OPERATION' },
					{ name: 'Platform',            value: 'PLATFORM' },
					{ name: 'Purchase Type',       value: 'PURCHASE_TYPE' },
					{ name: 'Region',              value: 'REGION' },
					{ name: 'Service',             value: 'SERVICE' },
					{ name: 'Usage Type',          value: 'USAGE_TYPE' },
					{ name: 'Usage Type Group',    value: 'USAGE_TYPE_GROUP' },
				],
				default: 'SERVICE',
				required: true,
			},

			// ── RI / SP: Group by Service ─────────────────────────────────────
			{
				displayName: 'Group By Service',
				name: 'riGroupByService',
				type: 'boolean',
				displayOptions: {
					show: {
						resource: ['reservedInstances'],
						operation: ['getUtilization', 'getCoverage'],
					},
				},
				default: true,
				description: 'Whether to break down RI data by AWS service',
			},

			// ── RI Recommendations ────────────────────────────────────────────
			{
				displayName: 'Service',
				name: 'riRecommendationService',
				type: 'options',
				displayOptions: {
					show: { resource: ['reservedInstances'], operation: ['getRecommendations'] },
				},
				options: [
					{ name: 'Amazon EC2',         value: 'Amazon EC2' },
					{ name: 'Amazon ElastiCache', value: 'Amazon ElastiCache' },
					{ name: 'Amazon ES',          value: 'Amazon Elasticsearch Service' },
					{ name: 'Amazon RDS',         value: 'Amazon RDS' },
					{ name: 'Amazon Redshift',    value: 'Amazon Redshift' },
				],
				default: 'Amazon EC2',
				description: 'AWS service to get RI purchase recommendations for',
			},
			{
				displayName: 'Term',
				name: 'riTerm',
				type: 'options',
				displayOptions: {
					show: { resource: ['reservedInstances'], operation: ['getRecommendations'] },
				},
				options: [
					{ name: 'One Year',   value: 'ONE_YEAR' },
					{ name: 'Three Year', value: 'THREE_YEARS' },
				],
				default: 'ONE_YEAR',
			},
			{
				displayName: 'Payment Option',
				name: 'riPaymentOption',
				type: 'options',
				displayOptions: {
					show: { resource: ['reservedInstances'], operation: ['getRecommendations'] },
				},
				options: [
					{ name: 'All Upfront',     value: 'ALL_UPFRONT' },
					{ name: 'No Upfront',      value: 'NO_UPFRONT' },
					{ name: 'Partial Upfront', value: 'PARTIAL_UPFRONT' },
				],
				default: 'NO_UPFRONT',
			},
			{
				displayName: 'Lookback Period',
				name: 'riLookbackPeriod',
				type: 'options',
				displayOptions: {
					show: { resource: ['reservedInstances'], operation: ['getRecommendations'] },
				},
				options: [
					{ name: '7 Days',  value: 'SEVEN_DAYS' },
					{ name: '30 Days', value: 'THIRTY_DAYS' },
					{ name: '60 Days', value: 'SIXTY_DAYS' },
				],
				default: 'THIRTY_DAYS',
			},

			// ── SP Recommendations ────────────────────────────────────────────
			{
				displayName: 'Savings Plans Type',
				name: 'spType',
				type: 'options',
				displayOptions: {
					show: { resource: ['savingsPlans'], operation: ['getRecommendations'] },
				},
				options: [
					{ name: 'Compute Savings Plans',              value: 'COMPUTE_SP' },
					{ name: 'EC2 Instance Savings Plans',        value: 'EC2_INSTANCE_SP' },
					{ name: 'SageMaker Savings Plans',           value: 'SAGEMAKER_SP' },
				],
				default: 'COMPUTE_SP',
			},
			{
				displayName: 'Term',
				name: 'spTerm',
				type: 'options',
				displayOptions: {
					show: { resource: ['savingsPlans'], operation: ['getRecommendations'] },
				},
				options: [
					{ name: 'One Year',   value: 'ONE_YEAR' },
					{ name: 'Three Year', value: 'THREE_YEARS' },
				],
				default: 'ONE_YEAR',
			},
			{
				displayName: 'Payment Option',
				name: 'spPaymentOption',
				type: 'options',
				displayOptions: {
					show: { resource: ['savingsPlans'], operation: ['getRecommendations'] },
				},
				options: [
					{ name: 'All Upfront',     value: 'ALL_UPFRONT' },
					{ name: 'No Upfront',      value: 'NO_UPFRONT' },
					{ name: 'Partial Upfront', value: 'PARTIAL_UPFRONT' },
				],
				default: 'NO_UPFRONT',
			},
			{
				displayName: 'Lookback Period',
				name: 'spLookbackPeriod',
				type: 'options',
				displayOptions: {
					show: { resource: ['savingsPlans'], operation: ['getRecommendations'] },
				},
				options: [
					{ name: '7 Days',  value: 'SEVEN_DAYS' },
					{ name: '30 Days', value: 'THIRTY_DAYS' },
					{ name: '60 Days', value: 'SIXTY_DAYS' },
				],
				default: 'THIRTY_DAYS',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: IDataObject[] = [];
		const credentials = await this.getCredentials('awsCostExplorerApi');

		const {
			CostExplorerClient,
			GetCostAndUsageCommand,
			GetCostForecastCommand,
			GetDimensionValuesCommand,
			GetReservationUtilizationCommand,
			GetReservationCoverageCommand,
			GetReservationPurchaseRecommendationCommand,
			GetSavingsPlansUtilizationCommand,
			GetSavingsPlansCoverageCommand,
			GetSavingsPlansPurchaseRecommendationCommand,
			GetAnomaliesCommand,
			GetAnomalyMonitorsCommand,
			GetAnomalySubscriptionsCommand,
		} = await import('@aws-sdk/client-cost-explorer');

		const client = new CostExplorerClient({
			region: (credentials.region as string) || 'us-east-1',
			credentials: {
				accessKeyId: credentials.accessKeyId as string,
				secretAccessKey: credentials.secretAccessKey as string,
				...(credentials.sessionToken
					? { sessionToken: credentials.sessionToken as string }
					: {}),
			},
		});

		for (let i = 0; i < items.length; i++) {
			try {
				const resource  = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				// ── Cost and Usage ─────────────────────────────────────────────
				if (resource === 'costAndUsage' && operation === 'get') {
					const startDate     = this.getNodeParameter('startDate', i) as string;
					const endDate       = this.getNodeParameter('endDate', i) as string;
					const granularity   = this.getNodeParameter('granularity', i) as string;
					const metrics       = this.getNodeParameter('metrics', i) as string[];
					const groupBy       = this.getNodeParameter('groupBy', i) as string;
					const groupByTagKey = this.getNodeParameter('groupByTagKey', i, '') as string;
					const groupBySec    = this.getNodeParameter('groupBySecondary', i, 'none') as string;
					const svcRaw        = this.getNodeParameter('serviceFilter', i, '') as string;
					const accRaw        = this.getNodeParameter('linkedAccountFilter', i, '') as string;
					const regRaw        = this.getNodeParameter('regionFilter', i, '') as string;
					const tagFilter     = this.getNodeParameter('tagFilter', i, {}) as IDataObject;
					const excludeCredits = this.getNodeParameter('excludeCredits', i, false) as boolean;
					const formatOutput  = this.getNodeParameter('formatOutput', i, false) as boolean;

					// GroupBy
					const groupByList: any[] = [];
					if (groupBy !== 'none') {
						groupByList.push({
							Type: groupBy === 'TAG' ? 'TAG' : 'DIMENSION',
							Key: groupBy === 'TAG' ? groupByTagKey : groupBy,
						});
					}
					if (groupBySec !== 'none') {
						groupByList.push({ Type: 'DIMENSION', Key: groupBySec });
					}

					// Filters
					const filterConditions: object[] = [];
					const svcList = csvToList(svcRaw);
					const accList = csvToList(accRaw);
					const regList = csvToList(regRaw);

					if (svcList.length) filterConditions.push(buildDimensionFilter('SERVICE', svcList));
					if (accList.length) filterConditions.push(buildDimensionFilter('LINKED_ACCOUNT', accList));
					if (regList.length) filterConditions.push(buildDimensionFilter('REGION', regList));

					const tagValues = (tagFilter as any)?.values;
					if (tagValues?.key && tagValues?.value) {
						filterConditions.push(buildTagFilter(tagValues.key, csvToList(tagValues.value)));
					}

					if (excludeCredits) {
						filterConditions.push({
							Not: { Dimensions: { Key: 'RECORD_TYPE', Values: ['Credit', 'Refund', 'Discount'] } },
						});
					}

					// Paginate
					const allPeriods = await paginate(async (token) => {
						const params: any = {
							TimePeriod: { Start: startDate, End: endDate },
							Granularity: granularity,
							Metrics: metrics,
							...(groupByList.length ? { GroupBy: groupByList } : {}),
							...(filterConditions.length ? { Filter: mergeFilters(filterConditions) } : {}),
							...(token ? { NextPageToken: token } : {}),
						};
						const resp = await client.send(new GetCostAndUsageCommand(params));
						return {
							results: resp.ResultsByTime ?? [],
							nextToken: resp.NextPageToken,
						};
					});

					if (formatOutput) {
						returnData.push(...(flattenCostResults(allPeriods, metrics) as IDataObject[]));
					} else {
						returnData.push({ ResultsByTime: allPeriods } as IDataObject);
					}
				}

				// ── Cost Forecast ──────────────────────────────────────────────
				else if (resource === 'costForecast' && operation === 'get') {
					const startDate     = this.getNodeParameter('startDate', i) as string;
					const endDate       = this.getNodeParameter('endDate', i) as string;
					const granularity   = this.getNodeParameter('granularity', i) as string;
					const forecastMetric = this.getNodeParameter('forecastMetric', i) as string;

					const resp = await client.send(new GetCostForecastCommand({
						TimePeriod: { Start: startDate, End: endDate },
						Granularity: granularity as any,
						Metric: forecastMetric as any,
					}));
					returnData.push(resp as unknown as IDataObject);
				}

				// ── Dimension Values ───────────────────────────────────────────
				else if (resource === 'dimensionValues' && operation === 'get') {
					const startDate = this.getNodeParameter('startDate', i) as string;
					const endDate   = this.getNodeParameter('endDate', i) as string;
					const dimension = this.getNodeParameter('dimension', i) as string;

					const allValues = await paginate(async (token) => {
						const resp = await client.send(new GetDimensionValuesCommand({
							TimePeriod: { Start: startDate, End: endDate },
							Dimension: dimension as any,
							...(token ? { NextPageToken: token } : {}),
						}));
						return {
							results: resp.DimensionValues ?? [],
							nextToken: resp.NextPageToken,
						};
					});
					returnData.push({ DimensionValues: allValues } as IDataObject);
				}

				// ── Reserved Instances: Utilization ────────────────────────────
				else if (resource === 'reservedInstances' && operation === 'getUtilization') {
					const startDate       = this.getNodeParameter('startDate', i) as string;
					const endDate         = this.getNodeParameter('endDate', i) as string;
					const granularity     = this.getNodeParameter('granularity', i) as string;
					const riGroupByService = this.getNodeParameter('riGroupByService', i, true) as boolean;

					const resp = await client.send(new GetReservationUtilizationCommand({
						TimePeriod: { Start: startDate, End: endDate },
						Granularity: granularity as any,
						...(riGroupByService ? { GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }] } : {}),
					}));
					returnData.push(resp as unknown as IDataObject);
				}

				// ── Reserved Instances: Coverage ───────────────────────────────
				else if (resource === 'reservedInstances' && operation === 'getCoverage') {
					const startDate       = this.getNodeParameter('startDate', i) as string;
					const endDate         = this.getNodeParameter('endDate', i) as string;
					const granularity     = this.getNodeParameter('granularity', i) as string;
					const riGroupByService = this.getNodeParameter('riGroupByService', i, true) as boolean;

					const resp = await client.send(new GetReservationCoverageCommand({
						TimePeriod: { Start: startDate, End: endDate },
						Granularity: granularity as any,
						...(riGroupByService ? { GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }] } : {}),
					}));
					returnData.push(resp as unknown as IDataObject);
				}

				// ── Reserved Instances: Recommendations ────────────────────────
				else if (resource === 'reservedInstances' && operation === 'getRecommendations') {
					const service       = this.getNodeParameter('riRecommendationService', i) as string;
					const term          = this.getNodeParameter('riTerm', i) as string;
					const paymentOption = this.getNodeParameter('riPaymentOption', i) as string;
					const lookback      = this.getNodeParameter('riLookbackPeriod', i) as string;

					const allRecs = await paginate(async (token) => {
						const resp = await client.send(new GetReservationPurchaseRecommendationCommand({
							Service: service,
							TermInYears: term as any,
							PaymentOption: paymentOption as any,
							LookbackPeriodInDays: lookback as any,
							...(token ? { NextPageToken: token } : {}),
						}));
						return {
							results: resp.Recommendations ?? [],
							nextToken: resp.NextPageToken,
						};
					});
					returnData.push({ Recommendations: allRecs } as IDataObject);
				}

				// ── Savings Plans: Utilization ─────────────────────────────────
				else if (resource === 'savingsPlans' && operation === 'getUtilization') {
					const startDate   = this.getNodeParameter('startDate', i) as string;
					const endDate     = this.getNodeParameter('endDate', i) as string;
					const granularity = this.getNodeParameter('granularity', i) as string;

					const resp = await client.send(new GetSavingsPlansUtilizationCommand({
						TimePeriod: { Start: startDate, End: endDate },
						Granularity: granularity as any,
					}));
					returnData.push(resp as unknown as IDataObject);
				}

				// ── Savings Plans: Coverage ────────────────────────────────────
				else if (resource === 'savingsPlans' && operation === 'getCoverage') {
					const startDate   = this.getNodeParameter('startDate', i) as string;
					const endDate     = this.getNodeParameter('endDate', i) as string;
					const granularity = this.getNodeParameter('granularity', i) as string;

					const resp = await client.send(new GetSavingsPlansCoverageCommand({
						TimePeriod: { Start: startDate, End: endDate },
						Granularity: granularity as any,
					}));
					returnData.push(resp as unknown as IDataObject);
				}

				// ── Savings Plans: Recommendations ─────────────────────────────
				else if (resource === 'savingsPlans' && operation === 'getRecommendations') {
					const spType        = this.getNodeParameter('spType', i) as string;
					const term          = this.getNodeParameter('spTerm', i) as string;
					const paymentOption = this.getNodeParameter('spPaymentOption', i) as string;
					const lookback      = this.getNodeParameter('spLookbackPeriod', i) as string;

					const resp = await client.send(new GetSavingsPlansPurchaseRecommendationCommand({
						SavingsPlansType: spType as any,
						TermInYears: term as any,
						PaymentOption: paymentOption as any,
						LookbackPeriodInDays: lookback as any,
					}));
					returnData.push(resp as unknown as IDataObject);
				}

				// ── Anomaly Detection: Get Anomalies ───────────────────────────
				else if (resource === 'anomaly' && operation === 'getAnomalies') {
					const startDate    = this.getNodeParameter('anomalyStartDate', i) as string;
					const endDate      = this.getNodeParameter('anomalyEndDate', i) as string;
					const minImpact    = this.getNodeParameter('anomalyMinImpact', i, 0) as number;

					const allAnomalies = await paginate(async (token) => {
						const resp = await client.send(new GetAnomaliesCommand({
							DateInterval: { StartDate: startDate, EndDate: endDate },
							...(minImpact > 0 ? { TotalImpact: { NumericOperator: 'GREATER_THAN_OR_EQUAL', StartValue: minImpact } } : {}),
							...(token ? { NextPageToken: token } : {}),
						}));
						return {
							results: resp.Anomalies ?? [],
							nextToken: resp.NextPageToken,
						};
					});
					returnData.push({ Anomalies: allAnomalies } as IDataObject);
				}

				// ── Anomaly Detection: Get Monitors ────────────────────────────
				else if (resource === 'anomaly' && operation === 'getMonitors') {
					const allMonitors = await paginate(async (token) => {
						const resp = await client.send(new GetAnomalyMonitorsCommand({
							...(token ? { NextPageToken: token } : {}),
						}));
						return {
							results: resp.AnomalyMonitors ?? [],
							nextToken: resp.NextPageToken,
						};
					});
					returnData.push({ AnomalyMonitors: allMonitors } as IDataObject);
				}

				// ── Anomaly Detection: Get Subscriptions ───────────────────────
				else if (resource === 'anomaly' && operation === 'getSubscriptions') {
					const allSubs = await paginate(async (token) => {
						const resp = await client.send(new GetAnomalySubscriptionsCommand({
							...(token ? { NextPageToken: token } : {}),
						}));
						return {
							results: resp.AnomalySubscriptions ?? [],
							nextToken: resp.NextPageToken,
						};
					});
					returnData.push({ AnomalySubscriptions: allSubs } as IDataObject);
				}

			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ error: (error as Error).message });
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error);
			}
		}

		return [this.helpers.returnJsonArray(returnData)];
	}
}
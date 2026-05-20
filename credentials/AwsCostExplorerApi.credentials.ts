import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

import { NodeOperationError } from 'n8n-workflow';

export class AwsCostExplorer implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'AWS Cost Explorer',
		name: 'awsCostExplorer',
		icon: 'file:awscostexplorer.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description: 'Get cost and usage data from AWS Cost Explorer',
		defaults: {
			name: 'AWS Cost Explorer',
		},
		inputs: ['main'] as any,
		outputs: ['main'] as any,
		credentials: [
			{
				name: 'awsCostExplorerApi',
				required: true,
			},
		],
		properties: [
			// ----------------------------------------------------------------
			// Resource
			// ----------------------------------------------------------------
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Cost and Usage',          value: 'costAndUsage' },
					{ name: 'Cost Forecast',           value: 'costForecast' },
					{ name: 'Dimension Values',        value: 'dimensionValues' },
					{ name: 'Reserved Instances',      value: 'reservedInstances' },
					{ name: 'Savings Plans',           value: 'savingsPlans' },
				],
				default: 'costAndUsage',
			},

			// ----------------------------------------------------------------
			// Operation — Cost and Usage
			// ----------------------------------------------------------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['costAndUsage'] } },
				options: [
					{ name: 'Get', value: 'get', description: 'Get cost and usage data', action: 'Get cost and usage data' },
				],
				default: 'get',
			},

			// ----------------------------------------------------------------
			// Operation — Cost Forecast
			// ----------------------------------------------------------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['costForecast'] } },
				options: [
					{ name: 'Get', value: 'get', description: 'Get cost forecast', action: 'Get cost forecast' },
				],
				default: 'get',
			},

			// ----------------------------------------------------------------
			// Operation — Dimension Values
			// ----------------------------------------------------------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['dimensionValues'] } },
				options: [
					{ name: 'Get', value: 'get', description: 'Get dimension values', action: 'Get dimension values' },
				],
				default: 'get',
			},

			// ----------------------------------------------------------------
			// Operation — Reserved Instances
			// ----------------------------------------------------------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['reservedInstances'] } },
				options: [
					{ name: 'Get Utilization', value: 'getUtilization', description: 'Get RI utilization and unused hours', action: 'Get RI utilization' },
					{ name: 'Get Coverage',    value: 'getCoverage',    description: 'Get percentage of usage covered by RIs', action: 'Get RI coverage' },
				],
				default: 'getUtilization',
			},

			// ----------------------------------------------------------------
			// Operation — Savings Plans
			// ----------------------------------------------------------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['savingsPlans'] } },
				options: [
					{ name: 'Get Utilization', value: 'getUtilization', description: 'Get SP utilization and unused commitment', action: 'Get SP utilization' },
					{ name: 'Get Coverage',    value: 'getCoverage',    description: 'Get percentage of usage covered by SPs', action: 'Get SP coverage' },
				],
				default: 'getUtilization',
			},

			// ----------------------------------------------------------------
			// Shared: Start Date / End Date
			// ----------------------------------------------------------------
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

			// ----------------------------------------------------------------
			// Cost and Usage: Granularity
			// ----------------------------------------------------------------
			{
				displayName: 'Granularity',
				name: 'granularity',
				type: 'options',
				displayOptions: { show: { resource: ['costAndUsage'], operation: ['get'] } },
				options: [
					{ name: 'Daily',   value: 'DAILY' },
					{ name: 'Monthly', value: 'MONTHLY' },
					{ name: 'Hourly',  value: 'HOURLY' },
				],
				default: 'MONTHLY',
			},

			// ----------------------------------------------------------------
			// Cost Forecast: Granularity
			// ----------------------------------------------------------------
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

			// ----------------------------------------------------------------
			// RI / SP: Granularity
			// ----------------------------------------------------------------
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

			// ----------------------------------------------------------------
			// Cost and Usage: Metrics
			// ----------------------------------------------------------------
			{
				displayName: 'Metrics',
				name: 'metrics',
				type: 'multiOptions',
				displayOptions: { show: { resource: ['costAndUsage'], operation: ['get'] } },
				options: [
					{ name: 'Amortized Cost',      value: 'AmortizedCost' },
					{ name: 'Blended Cost',        value: 'BlendedCost' },
					{ name: 'Net Amortized Cost',  value: 'NetAmortizedCost' },
					{ name: 'Net Unblended Cost',  value: 'NetUnblendedCost' },
					{ name: 'Unblended Cost',      value: 'UnblendedCost' },
					{ name: 'Usage Quantity',      value: 'UsageQuantity' },
					{ name: 'Normalized Usage Amount', value: 'NormalizedUsageAmount' },
				],
				default: ['UnblendedCost'],
				description: 'Which cost metrics to return. Use Unblended Cost for most cases.',
			},

			// ----------------------------------------------------------------
			// Cost Forecast: Metric (single)
			// ----------------------------------------------------------------
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

			// ----------------------------------------------------------------
			// Cost and Usage: Group By
			// ----------------------------------------------------------------
			{
				displayName: 'Group By',
				name: 'groupBy',
				type: 'options',
				displayOptions: { show: { resource: ['costAndUsage'], operation: ['get'] } },
				options: [
					{ name: 'None',              value: 'none' },
					{ name: 'Service',           value: 'SERVICE' },
					{ name: 'Linked Account',    value: 'LINKED_ACCOUNT' },
					{ name: 'Region',            value: 'REGION' },
					{ name: 'Purchase Type',     value: 'PURCHASE_TYPE' },
					{ name: 'Instance Type',     value: 'INSTANCE_TYPE' },
					{ name: 'Usage Type',        value: 'USAGE_TYPE' },
					{ name: 'Tag',               value: 'TAG' },
				],
				default: 'none',
				description: 'Dimension to group costs by',
			},
			{
				displayName: 'Tag Key',
				name: 'tagKey',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['costAndUsage'],
						operation: ['get'],
						groupBy: ['TAG'],
					},
				},
				default: '',
				placeholder: 'Environment',
				description: 'Tag key to group costs by (required when Group By = Tag)',
				required: true,
			},

			// ----------------------------------------------------------------
			// Cost and Usage: Secondary Group By
			// ----------------------------------------------------------------
			{
				displayName: 'Secondary Group By',
				name: 'groupBySecondary',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['costAndUsage'],
						operation: ['get'],
					},
					hide: {
						groupBy: ['none'],
					},
				},
				options: [
					{ name: 'None',           value: 'none' },
					{ name: 'Service',        value: 'SERVICE' },
					{ name: 'Linked Account', value: 'LINKED_ACCOUNT' },
					{ name: 'Region',         value: 'REGION' },
					{ name: 'Purchase Type',  value: 'PURCHASE_TYPE' },
				],
				default: 'none',
				description: 'Add a second grouping dimension (max 2 GroupBy supported by AWS)',
			},

			// ----------------------------------------------------------------
			// Cost and Usage: Filters
			// ----------------------------------------------------------------
			{
				displayName: 'Filter by Service',
				name: 'serviceFilter',
				type: 'string',
				displayOptions: { show: { resource: ['costAndUsage'], operation: ['get'] } },
				default: '',
				placeholder: 'Amazon EC2',
				description: 'Filter by a specific AWS service name. Leave empty for all services.',
			},
			{
				displayName: 'Filter by Linked Account',
				name: 'linkedAccountFilter',
				type: 'string',
				displayOptions: { show: { resource: ['costAndUsage'], operation: ['get'] } },
				default: '',
				placeholder: '123456789012',
				description: 'Filter by a specific linked account ID. Leave empty for all accounts.',
			},
			{
				displayName: 'Filter by Region',
				name: 'regionFilter',
				type: 'string',
				displayOptions: { show: { resource: ['costAndUsage'], operation: ['get'] } },
				default: '',
				placeholder: 'us-east-1',
				description: 'Filter by a specific AWS region. Leave empty for all regions.',
			},
			{
				displayName: 'Exclude Credits',
				name: 'excludeCredits',
				type: 'boolean',
				displayOptions: { show: { resource: ['costAndUsage'], operation: ['get'] } },
				default: false,
				description: 'Whether to exclude credits, refunds and discounts from the response',
			},

			// ----------------------------------------------------------------
			// Dimension Values: Dimension
			// ----------------------------------------------------------------
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

			// ----------------------------------------------------------------
			// RI: Group By Service
			// ----------------------------------------------------------------
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
				description: 'Whether to break down RI utilization/coverage by AWS service',
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
			GetSavingsPlansUtilizationCommand,
			GetSavingsPlansCoverageCommand,
		} = await import('@aws-sdk/client-cost-explorer');

		const client = new CostExplorerClient({
			region: (credentials.region as string) || 'us-east-1',
			credentials: {
				accessKeyId: credentials.accessKeyId as string,
				secretAccessKey: credentials.secretAccessKey as string,
				...(credentials.sessionToken ? { sessionToken: credentials.sessionToken as string } : {}),
			},
		});

		for (let i = 0; i < items.length; i++) {
			try {
				const resource  = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const startDate = this.getNodeParameter('startDate', i, '') as string;
				const endDate   = this.getNodeParameter('endDate', i, '') as string;

				// ----------------------------------------------------------------
				// Cost and Usage
				// ----------------------------------------------------------------
				if (resource === 'costAndUsage' && operation === 'get') {
					const granularity       = this.getNodeParameter('granularity', i) as string;
					const metrics           = this.getNodeParameter('metrics', i) as string[];
					const groupBy           = this.getNodeParameter('groupBy', i) as string;
					const groupBySecondary  = this.getNodeParameter('groupBySecondary', i, 'none') as string;
					const tagKey            = this.getNodeParameter('tagKey', i, '') as string;
					const serviceFilter     = this.getNodeParameter('serviceFilter', i, '') as string;
					const linkedAccountFilter = this.getNodeParameter('linkedAccountFilter', i, '') as string;
					const regionFilter      = this.getNodeParameter('regionFilter', i, '') as string;
					const excludeCredits    = this.getNodeParameter('excludeCredits', i, false) as boolean;

					const params: any = {
						TimePeriod: { Start: startDate, End: endDate },
						Granularity: granularity,
						Metrics: metrics,
					};

					// Group By
					const groupByList: any[] = [];
					if (groupBy !== 'none') {
						groupByList.push({
							Type: groupBy === 'TAG' ? 'TAG' : 'DIMENSION',
							Key: groupBy === 'TAG' ? tagKey : groupBy,
						});
					}
					if (groupBySecondary !== 'none') {
						groupByList.push({ Type: 'DIMENSION', Key: groupBySecondary });
					}
					if (groupByList.length > 0) {
						params.GroupBy = groupByList;
					}

					// Filters — AND together when multiple are set
					const filterConditions: any[] = [];

					if (serviceFilter?.trim()) {
						filterConditions.push({
							Dimensions: { Key: 'SERVICE', Values: [serviceFilter.trim()] },
						});
					}
					if (linkedAccountFilter?.trim()) {
						filterConditions.push({
							Dimensions: { Key: 'LINKED_ACCOUNT', Values: [linkedAccountFilter.trim()] },
						});
					}
					if (regionFilter?.trim()) {
						filterConditions.push({
							Dimensions: { Key: 'REGION', Values: [regionFilter.trim()] },
						});
					}
					if (excludeCredits) {
						filterConditions.push({
							Not: {
								Dimensions: {
									Key: 'RECORD_TYPE',
									Values: ['Credit', 'Refund', 'Discount'],
								},
							},
						});
					}

					if (filterConditions.length === 1) {
						params.Filter = filterConditions[0];
					} else if (filterConditions.length > 1) {
						params.Filter = { And: filterConditions };
					}

					const response = await client.send(new GetCostAndUsageCommand(params));
					returnData.push(response as unknown as IDataObject);
				}

				// ----------------------------------------------------------------
				// Cost Forecast
				// ----------------------------------------------------------------
				if (resource === 'costForecast' && operation === 'get') {
					const granularity    = this.getNodeParameter('granularity', i) as string;
					const forecastMetric = this.getNodeParameter('forecastMetric', i) as string;

					const response = await client.send(new GetCostForecastCommand({
						TimePeriod: { Start: startDate, End: endDate },
						Granularity: granularity as any,
						Metric: forecastMetric as any,
					}));
					returnData.push(response as unknown as IDataObject);
				}

				// ----------------------------------------------------------------
				// Dimension Values
				// ----------------------------------------------------------------
				if (resource === 'dimensionValues' && operation === 'get') {
					const dimension = this.getNodeParameter('dimension', i) as string;

					const response = await client.send(new GetDimensionValuesCommand({
						TimePeriod: { Start: startDate, End: endDate },
						Dimension: dimension as any,
					}));
					returnData.push(response as unknown as IDataObject);
				}

				// ----------------------------------------------------------------
				// Reserved Instances — Utilization
				// ----------------------------------------------------------------
				if (resource === 'reservedInstances' && operation === 'getUtilization') {
					const granularity      = this.getNodeParameter('granularity', i) as string;
					const riGroupByService = this.getNodeParameter('riGroupByService', i, true) as boolean;

					const params: any = {
						TimePeriod: { Start: startDate, End: endDate },
						Granularity: granularity as any,
					};
					if (riGroupByService) {
						params.GroupBy = [{ Type: 'DIMENSION', Key: 'SERVICE' }];
					}

					const response = await client.send(new GetReservationUtilizationCommand(params));
					returnData.push(response as unknown as IDataObject);
				}

				// ----------------------------------------------------------------
				// Reserved Instances — Coverage
				// ----------------------------------------------------------------
				if (resource === 'reservedInstances' && operation === 'getCoverage') {
					const granularity      = this.getNodeParameter('granularity', i) as string;
					const riGroupByService = this.getNodeParameter('riGroupByService', i, true) as boolean;

					const params: any = {
						TimePeriod: { Start: startDate, End: endDate },
						Granularity: granularity as any,
					};
					if (riGroupByService) {
						params.GroupBy = [{ Type: 'DIMENSION', Key: 'SERVICE' }];
					}

					const response = await client.send(new GetReservationCoverageCommand(params));
					returnData.push(response as unknown as IDataObject);
				}

				// ----------------------------------------------------------------
				// Savings Plans — Utilization
				// ----------------------------------------------------------------
				if (resource === 'savingsPlans' && operation === 'getUtilization') {
					const granularity = this.getNodeParameter('granularity', i) as string;

					const response = await client.send(new GetSavingsPlansUtilizationCommand({
						TimePeriod: { Start: startDate, End: endDate },
						Granularity: granularity as any,
					}));
					returnData.push(response as unknown as IDataObject);
				}

				// ----------------------------------------------------------------
				// Savings Plans — Coverage
				// ----------------------------------------------------------------
				if (resource === 'savingsPlans' && operation === 'getCoverage') {
					const granularity = this.getNodeParameter('granularity', i) as string;

					const response = await client.send(new GetSavingsPlansCoverageCommand({
						TimePeriod: { Start: startDate, End: endDate },
						Granularity: granularity as any,
					}));
					returnData.push(response as unknown as IDataObject);
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
import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IDataObject,
  NodeOperationError,
  ILoadOptionsFunctions,
  INodePropertyOptions,
} from 'n8n-workflow';
import * as crypto from 'crypto';
import { createToken, createBudget } from '@chucky.cloud/sdk';

// Hardcoded URLs
const PORTAL_URL = 'https://doting-hornet-490.convex.site';
const WORKER_URL = 'https://conjure.chucky.cloud';

interface IncubateResponse {
  vesselId: string;
  idempotencyKey: string;
  status: string;
  scheduledFor?: string;
  error?: string;
  message?: string;
}

interface SDKResult {
  type: 'result';
  subtype: 'success' | 'error_max_turns' | 'error_during_execution' | 'error_max_budget_usd' | 'error_max_structured_output_retries';
  result?: string;
  structured_output?: unknown;
  total_cost_usd?: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface IncubateOutput {
  success: boolean;
  text?: string;
  result?: SDKResult;
  error?: string;
}

interface Job {
  id: string;
  status: string;
  taskIdentifier: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  isCompleted: boolean;
  isSuccess: boolean;
  isFailed: boolean;
  output?: IncubateOutput;
  error?: { message: string; name?: string };
}

interface Project {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
}

export class ChuckyJob implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Chucky',
    name: 'chuckyJob',
    icon: 'file:chucky.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Create and manage Chucky AI agent jobs',
    defaults: {
      name: 'Chucky',
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'chuckyApi',
        required: true,
      },
    ],
    properties: [
      // Operation
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Create Job',
            value: 'create',
            description: 'Create a new background AI job',
            action: 'Create job',
          },
          {
            name: 'Get Job',
            value: 'get',
            description: 'Get status of an existing job',
            action: 'Get job',
          },
          {
            name: 'Cancel Job',
            value: 'cancel',
            description: 'Cancel a running job',
            action: 'Cancel job',
          },
          {
            name: 'List Jobs',
            value: 'list',
            description: 'List recent jobs',
            action: 'List jobs',
          },
        ],
        default: 'create',
      },

      // Project selection (for create operation)
      {
        displayName: 'Project',
        name: 'projectId',
        type: 'options',
        typeOptions: {
          loadOptionsMethod: 'getProjects',
        },
        default: '',
        required: true,
        displayOptions: {
          show: {
            operation: ['create'],
          },
        },
        description: 'The Chucky project to run the job in',
      },

      // Create Job Fields
      {
        displayName: 'Message',
        name: 'message',
        type: 'string',
        typeOptions: {
          rows: 4,
        },
        default: '',
        required: true,
        displayOptions: {
          show: {
            operation: ['create'],
          },
        },
        description: 'The prompt/message to send to the AI agent',
      },

      // Get/Cancel Job Fields
      {
        displayName: 'Job ID',
        name: 'jobId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: {
          show: {
            operation: ['get', 'cancel'],
          },
        },
        description: 'The job ID (e.g., run_xxx)',
      },

      // List Jobs Options
      {
        displayName: 'List Options',
        name: 'listOptions',
        type: 'collection',
        placeholder: 'Add Option',
        default: {},
        displayOptions: {
          show: {
            operation: ['list'],
          },
        },
        options: [
          {
            displayName: 'Status Filter',
            name: 'status',
            type: 'options',
            options: [
              { name: 'All', value: '' },
              { name: 'Pending', value: 'PENDING' },
              { name: 'Queued', value: 'QUEUED' },
              { name: 'Executing', value: 'EXECUTING' },
              { name: 'Completed', value: 'COMPLETED' },
              { name: 'Failed', value: 'FAILED' },
              { name: 'Canceled', value: 'CANCELED' },
            ],
            default: '',
            description: 'Filter jobs by status',
          },
          {
            displayName: 'Limit',
            name: 'limit',
            type: 'number',
            default: 25,
            description: 'Maximum number of jobs to return',
          },
        ],
      },

      // Wait for Completion
      {
        displayName: 'Wait for Completion',
        name: 'waitForCompletion',
        type: 'boolean',
        default: true,
        displayOptions: {
          show: {
            operation: ['create'],
          },
        },
        description: 'Whether to wait for the job to complete before returning',
      },

      // Polling Options
      {
        displayName: 'Polling Options',
        name: 'pollingOptions',
        type: 'collection',
        placeholder: 'Add Option',
        default: {},
        displayOptions: {
          show: {
            operation: ['create'],
            waitForCompletion: [true],
          },
        },
        options: [
          {
            displayName: 'Polling Interval (Seconds)',
            name: 'pollingInterval',
            type: 'number',
            default: 5,
            description: 'How often to check job status',
          },
          {
            displayName: 'Timeout (Seconds)',
            name: 'timeout',
            type: 'number',
            default: 600,
            description: 'Maximum time to wait for job completion',
          },
        ],
      },

      // Model Options
      {
        displayName: 'Model Options',
        name: 'modelOptions',
        type: 'collection',
        placeholder: 'Add Option',
        default: {},
        displayOptions: {
          show: {
            operation: ['create'],
          },
        },
        options: [
          {
            displayName: 'Model',
            name: 'model',
            type: 'options',
            options: [
              { name: 'Claude Sonnet 4.5', value: 'claude-sonnet-4-5-20250929' },
              { name: 'Claude Opus 4.5', value: 'claude-opus-4-5-20251101' },
              { name: 'Claude Haiku 3.5', value: 'claude-3-5-haiku-20241022' },
              { name: 'Custom', value: 'custom' },
            ],
            default: 'claude-sonnet-4-5-20250929',
            description: 'The AI model to use',
          },
          {
            displayName: 'Custom Model',
            name: 'customModel',
            type: 'string',
            default: '',
            displayOptions: {
              show: {
                model: ['custom'],
              },
            },
            description: 'Custom model identifier (e.g., or:mistralai/mistral-large)',
          },
          {
            displayName: 'System Prompt',
            name: 'systemPrompt',
            type: 'string',
            typeOptions: {
              rows: 4,
            },
            default: '',
            description: 'System prompt to set the AI behavior',
          },
          {
            displayName: 'Max Turns',
            name: 'maxTurns',
            type: 'number',
            default: 0,
            description: 'Maximum conversation turns (0 = unlimited)',
          },
          {
            displayName: 'Output Format (JSON Schema)',
            name: 'outputFormat',
            type: 'json',
            default: '',
            description: 'JSON schema to enforce structured output. When set, the validated JSON will be available in the "structuredOutput" field of the result. Example: {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}',
          },
        ],
      },

      // Tool Options
      {
        displayName: 'Tool Options',
        name: 'toolOptions',
        type: 'collection',
        placeholder: 'Add Option',
        default: {},
        displayOptions: {
          show: {
            operation: ['create'],
          },
        },
        options: [
          {
            displayName: 'Tools',
            name: 'tools',
            type: 'string',
            default: '',
            description: 'Tools configuration (JSON array or comma-separated names)',
          },
          {
            displayName: 'Allowed Tools',
            name: 'allowedTools',
            type: 'string',
            default: '',
            description: 'Comma-separated list of allowed tools',
          },
          {
            displayName: 'Disallowed Tools',
            name: 'disallowedTools',
            type: 'string',
            default: '',
            description: 'Comma-separated list of disallowed tools',
          },
          {
            displayName: 'Permission Mode',
            name: 'permissionMode',
            type: 'options',
            options: [
              { name: 'Default', value: 'default' },
              { name: 'Bypass Permissions', value: 'bypassPermissions' },
            ],
            default: 'default',
            description: 'Permission mode for tool execution',
          },
        ],
      },

      // Callback Options
      {
        displayName: 'Callback Options',
        name: 'callbackOptions',
        type: 'collection',
        placeholder: 'Add Callback',
        default: {},
        displayOptions: {
          show: {
            operation: ['create'],
          },
        },
        options: [
          {
            displayName: 'Callback URL',
            name: 'callbackUrl',
            type: 'string',
            default: '',
            description: 'Webhook URL for result delivery',
          },
          {
            displayName: 'Callback Secret',
            name: 'callbackSecret',
            type: 'string',
            typeOptions: {
              password: true,
            },
            default: '',
            description: 'Secret for webhook HMAC signature',
          },
        ],
      },

      // Advanced Options
      {
        displayName: 'Advanced Options',
        name: 'advancedOptions',
        type: 'collection',
        placeholder: 'Add Option',
        default: {},
        displayOptions: {
          show: {
            operation: ['create'],
          },
        },
        options: [
          {
            displayName: 'User ID',
            name: 'userId',
            type: 'string',
            default: '',
            description: 'User ID for the job (for billing/tracking)',
          },
          {
            displayName: 'Idempotency Key',
            name: 'idempotencyKey',
            type: 'string',
            default: '',
            description: 'Custom idempotency key to prevent duplicate job creation. If empty, one will be auto-generated.',
          },
          {
            displayName: 'TTL (Seconds)',
            name: 'ttl',
            type: 'number',
            default: 0,
            description: 'Delay execution by N seconds (0 = immediate)',
          },
          {
            displayName: 'AI Budget (USD)',
            name: 'aiBudget',
            type: 'number',
            default: 10,
            description: 'Maximum AI spend in USD',
          },
          {
            displayName: 'Compute Budget (Hours)',
            name: 'computeBudget',
            type: 'number',
            default: 1,
            description: 'Maximum compute time in hours',
          },
        ],
      },
    ],
  };

  methods = {
    loadOptions: {
      async getProjects(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        const credentials = await this.getCredentials('chuckyApi');
        const apiKey = credentials.apiKey as string;

        try {
          const response = await this.helpers.request({
            method: 'GET',
            url: `${PORTAL_URL}/api/projects`,
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
            json: true,
          });

          const projects = (response as { projects: Project[] }).projects;
          return projects.map((project) => ({
            name: project.name,
            value: project.id,
            description: project.description,
          }));
        } catch (error) {
          // Return empty if API fails
          return [];
        }
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const credentials = await this.getCredentials('chuckyApi');
    const apiKey = credentials.apiKey as string;

    for (let i = 0; i < items.length; i++) {
      try {
        const operation = this.getNodeParameter('operation', i) as string;

        if (operation === 'create') {
          const result = await createJob.call(this, i, apiKey);
          returnData.push({ json: result as IDataObject });
        } else if (operation === 'get') {
          const jobId = this.getNodeParameter('jobId', i) as string;
          const result = await getJob.call(this, jobId, apiKey);
          returnData.push({ json: result as unknown as IDataObject });
        } else if (operation === 'cancel') {
          const jobId = this.getNodeParameter('jobId', i) as string;
          const result = await cancelJob.call(this, jobId, apiKey);
          returnData.push({ json: result as IDataObject });
        } else if (operation === 'list') {
          const result = await listJobs.call(this, i, apiKey);
          returnData.push({ json: result as IDataObject });
        }
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: { error: (error as Error).message },
            pairedItem: { item: i },
          });
          continue;
        }
        throw error;
      }
    }

    return [returnData];
  }
}

/**
 * Fetch HMAC key for a project from the portal API
 */
async function getHmacKey(
  context: IExecuteFunctions,
  projectId: string,
  apiKey: string,
): Promise<string> {
  const response = await context.helpers.request({
    method: 'POST',
    url: `${PORTAL_URL}/api/projects/hmac-key`,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: { projectId },
    json: true,
  });

  return (response as { hmacKey: string }).hmacKey;
}

async function createJob(
  this: IExecuteFunctions,
  itemIndex: number,
  apiKey: string,
): Promise<IDataObject> {
  const projectId = this.getNodeParameter('projectId', itemIndex) as string;
  const message = this.getNodeParameter('message', itemIndex) as string;
  const waitForCompletion = this.getNodeParameter('waitForCompletion', itemIndex) as boolean;
  const pollingOptions = this.getNodeParameter('pollingOptions', itemIndex, {}) as {
    pollingInterval?: number;
    timeout?: number;
  };
  const modelOptions = this.getNodeParameter('modelOptions', itemIndex, {}) as {
    model?: string;
    customModel?: string;
    systemPrompt?: string;
    maxTurns?: number;
    outputFormat?: object;
  };
  const toolOptions = this.getNodeParameter('toolOptions', itemIndex, {}) as {
    tools?: string;
    allowedTools?: string;
    disallowedTools?: string;
    permissionMode?: string;
  };
  const callbackOptions = this.getNodeParameter('callbackOptions', itemIndex, {}) as {
    callbackUrl?: string;
    callbackSecret?: string;
  };
  const advancedOptions = this.getNodeParameter('advancedOptions', itemIndex, {}) as {
    userId?: string;
    idempotencyKey?: string;
    ttl?: number;
    aiBudget?: number;
    computeBudget?: number;
  };

  // Fetch HMAC key from portal API
  const hmacSecret = await getHmacKey(this, projectId, apiKey);

  // Generate JWT token using chucky-sdk
  const token = await createToken({
    userId: advancedOptions.userId || 'n8n-workflow',
    projectId,
    secret: hmacSecret,
    expiresIn: 3600,
    budget: createBudget({
      aiDollars: advancedOptions.aiBudget || 10,
      computeHours: advancedOptions.computeBudget || 1,
      window: 'day',
    }),
  });

  // Use custom idempotency key or generate one
  const idempotencyKey = advancedOptions.idempotencyKey || `n8n-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  // Determine model
  let model = modelOptions.model || 'claude-sonnet-4-5-20250929';
  if (model === 'custom' && modelOptions.customModel) {
    model = modelOptions.customModel;
  }

  // Parse tools option
  let toolsValue: unknown = undefined;
  if (toolOptions.tools) {
    try {
      toolsValue = JSON.parse(toolOptions.tools);
    } catch {
      toolsValue = toolOptions.tools.split(',').map((t) => t.trim());
    }
  }

  // Parse outputFormat - n8n JSON field may return string or object
  let parsedOutputFormat: Record<string, unknown> | undefined;
  if (modelOptions.outputFormat) {
    if (typeof modelOptions.outputFormat === 'string') {
      // It's a string, parse it
      try {
        const parsed = JSON.parse(modelOptions.outputFormat);
        if (parsed && typeof parsed === 'object') {
          parsedOutputFormat = parsed;
        }
      } catch {
        // Invalid JSON, ignore
      }
    } else if (typeof modelOptions.outputFormat === 'object') {
      // Already an object
      parsedOutputFormat = modelOptions.outputFormat as Record<string, unknown>;
    }
  }

  // Build request body
  const body: Record<string, unknown> = {
    message,
    idempotencyKey,
    options: {
      token,
      model,
      ...(modelOptions.systemPrompt && { systemPrompt: modelOptions.systemPrompt }),
      ...(modelOptions.maxTurns && { maxTurns: modelOptions.maxTurns }),
      ...(parsedOutputFormat && Object.keys(parsedOutputFormat).length > 0 && {
        outputFormat: {
          type: 'json_schema',
          schema: parsedOutputFormat
        }
      }),
      ...(toolsValue !== undefined && { tools: toolsValue }),
      ...(toolOptions.allowedTools && {
        allowedTools: toolOptions.allowedTools.split(',').map((t) => t.trim()),
      }),
      ...(toolOptions.disallowedTools && {
        disallowedTools: toolOptions.disallowedTools.split(',').map((t) => t.trim()),
      }),
      ...(toolOptions.permissionMode &&
        toolOptions.permissionMode !== 'default' && {
          permissionMode: toolOptions.permissionMode,
          allowDangerouslySkipPermissions: toolOptions.permissionMode === 'bypassPermissions',
        }),
    },
  };

  if (advancedOptions.ttl && advancedOptions.ttl > 0) {
    body.ttl = advancedOptions.ttl;
  }

  if (callbackOptions.callbackUrl) {
    body.callback = {
      url: callbackOptions.callbackUrl,
      ...(callbackOptions.callbackSecret && { secret: callbackOptions.callbackSecret }),
    };
  }

  // Call incubate endpoint
  const response = await this.helpers.request({
    method: 'POST',
    url: `${WORKER_URL}/incubate`,
    body,
    json: true,
  });

  const data = response as IncubateResponse;

  if (data.error || data.message) {
    throw new NodeOperationError(
      this.getNode(),
      data.message || data.error || 'Failed to create job',
    );
  }

  // If not waiting for completion, return immediately
  if (!waitForCompletion) {
    return {
      jobId: data.vesselId,
      idempotencyKey: data.idempotencyKey,
      status: data.status,
      scheduledFor: data.scheduledFor,
    } as IDataObject;
  }

  // Poll for completion
  const pollingInterval = (pollingOptions.pollingInterval || 5) * 1000;
  const timeout = (pollingOptions.timeout || 600) * 1000;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const job = await getJob.call(this, data.vesselId, apiKey);

    if (job.isCompleted) {
      // Flatten output for easier access
      const result: IDataObject = {
        jobId: job.id,
        status: job.status,
        isSuccess: job.isSuccess,
        isFailed: job.isFailed,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
      };

      // Extract output fields at top level
      if (job.output) {
        result.success = job.output.success;
        result.text = job.output.text;
        result.error = job.output.error;

        // Extract SDK result fields
        if (job.output.result) {
          result.resultSubtype = job.output.result.subtype;
          result.resultText = job.output.result.result;
          result.totalCostUsd = job.output.result.total_cost_usd;
          result.usage = job.output.result.usage;

          // IMPORTANT: Expose structured_output at top level for JSON schema results
          if (job.output.result.structured_output !== undefined) {
            result.structuredOutput = job.output.result.structured_output;
          }
        }
      }

      // Also include raw output for advanced use cases
      result.rawOutput = job.output as unknown as IDataObject;

      return result;
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollingInterval));
  }

  throw new NodeOperationError(
    this.getNode(),
    `Job ${data.vesselId} did not complete within ${pollingOptions.timeout || 600} seconds`,
  );
}

async function getJob(
  this: IExecuteFunctions,
  jobId: string,
  apiKey: string,
): Promise<Job> {
  const response = await this.helpers.request({
    method: 'POST',
    url: `${PORTAL_URL}/api/jobs/get`,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: { jobId },
    json: true,
  });

  return (response as { job: Job }).job;
}

async function cancelJob(
  this: IExecuteFunctions,
  jobId: string,
  apiKey: string,
): Promise<IDataObject> {
  await this.helpers.request({
    method: 'POST',
    url: `${PORTAL_URL}/api/jobs/cancel`,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: { jobId },
    json: true,
  });

  return { success: true, jobId };
}

async function listJobs(
  this: IExecuteFunctions,
  itemIndex: number,
  apiKey: string,
): Promise<IDataObject> {
  const listOptions = this.getNodeParameter('listOptions', itemIndex, {}) as {
    status?: string;
    limit?: number;
  };

  const response = await this.helpers.request({
    method: 'POST',
    url: `${PORTAL_URL}/api/jobs/list`,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      status: listOptions.status || undefined,
      size: listOptions.limit || 25,
    },
    json: true,
  });

  return response as IDataObject;
}

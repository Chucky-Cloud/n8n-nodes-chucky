# n8n-nodes-chucky

Run **Claude Code** (Anthropic's agentic AI) directly in your n8n workflows.

This is an n8n community node for [Chucky](https://chucky.cloud) - the platform that lets you run Claude Code agents in the cloud with full tool access (file system, bash, web browsing, and more).

## Why use this?

- **Claude Code in n8n** - Run the same powerful AI agent that powers Claude's computer use
- **Multi-model support** - Use Claude (Sonnet, Opus, Haiku), OpenAI models, or any OpenRouter model
- **Full agent capabilities** - File operations, code execution, web browsing, and custom tools
- **Background jobs** - Long-running tasks that don't block your workflow
- **Structured output** - Get validated JSON responses with schema enforcement

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

## Installation

### Community Nodes (Recommended)

1. Go to **Settings > Community Nodes**
2. Select **Install**
3. Enter `@chucky.cloud/n8n-nodes-chucky`
4. Click **Install**

### Manual Installation

```bash
cd ~/.n8n/nodes
npm install @chucky.cloud/n8n-nodes-chucky
```

## Credentials

You need a Chucky API key from your [Chucky Dashboard](https://app.chucky.cloud):

| Field | Description |
|-------|-------------|
| API Key | Your account API key (`ak_live_...`) |

The node will automatically fetch your projects and generate authentication tokens.

## Operations

### Create Job

Creates a new background AI agent job.

| Parameter | Description |
|-----------|-------------|
| **Project** | Select from your available projects |
| **Message** | The prompt to send to the AI agent |
| **Wait for Completion** | Poll until job finishes (default: true) |

**Model Options:**
- Model: Claude Sonnet 4.5, Opus 4.5, Haiku 3.5, or custom (OpenAI, OpenRouter)
- System Prompt
- Max Turns
- Output Format (JSON Schema for structured output)

**Tool Options:**
- Tools configuration
- Allowed/Disallowed tools
- Permission Mode

**Callback Options:**
- Webhook URL for result delivery
- HMAC signature secret

**Advanced Options:**
- User ID (for billing/tracking)
- Idempotency Key
- TTL (delay execution)
- AI/Compute budgets

### Get Job

Get the status and result of an existing job by ID.

### Cancel Job

Cancel a running job by ID.

### List Jobs

List recent jobs with optional status filter.

## Output

When a job completes, the node returns:

| Field | Description |
|-------|-------------|
| `jobId` | The job ID |
| `status` | Job status |
| `isSuccess` | Whether job succeeded |
| `text` | Text result from the agent |
| `structuredOutput` | Parsed JSON (when using Output Format) |
| `totalCostUsd` | API cost in USD |
| `usage` | Token usage stats |

## Structured Output

To get validated JSON output, set the **Output Format** field with a JSON Schema:

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "age": { "type": "number" }
  },
  "required": ["name"]
}
```

The validated result will be in `{{ $json.structuredOutput }}`.

## Resources

- [Chucky Website](https://chucky.cloud)
- [Chucky Documentation](https://docs.chucky.cloud)
- [n8n Community Nodes](https://docs.n8n.io/integrations/community-nodes/)

## License

[MIT](LICENSE)

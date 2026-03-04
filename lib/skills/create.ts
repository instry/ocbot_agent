// lib/skills/create.ts — Skill creation from agent execution or manual input
import type { AgentReplayStep } from '@/lib/agent/agentCache'
import type { LlmProvider, LlmRequestMessage } from '@/lib/llm/types'
import type { Skill, SkillParameter } from './types'
import { streamChat } from '@/lib/llm/client'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a human-readable summary of the meaningful steps. */
function summariseSteps(steps: AgentReplayStep[]): string {
  const lines: string[] = []
  let idx = 1
  for (const s of steps) {
    switch (s.type) {
      case 'act':
        lines.push(`${idx}. act — ${s.instruction}`)
        idx++
        break
      case 'navigate':
        lines.push(`${idx}. navigate — ${s.url}`)
        idx++
        break
      case 'fillForm':
        lines.push(`${idx}. fillForm — fields: ${s.fields.map(f => f.field).join(', ')}`)
        idx++
        break
      // scroll / wait / ariaTree etc. are not interesting for the LLM summary
      default:
        break
    }
  }
  return lines.join('\n')
}

/** Derive a kebab-case name from a free-text instruction. */
function deriveNameFromInstruction(instruction: string): string {
  return instruction
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
}

/** Collect the full text response from the LLM stream. */
async function collectStreamText(
  provider: LlmProvider,
  messages: LlmRequestMessage[],
  signal?: AbortSignal,
): Promise<string> {
  let text = ''
  for await (const event of streamChat(provider, messages, undefined, signal)) {
    if (event.type === 'text_delta') {
      text += event.text
    } else if (event.type === 'error') {
      throw new Error(event.error)
    }
  }
  return text
}

/** Strip optional markdown code fences and parse JSON. */
function parseJsonResponse(raw: string): Record<string, unknown> {
  let trimmed = raw.trim()
  // Strip ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/)
  if (fenceMatch) {
    trimmed = fenceMatch[1].trim()
  }
  return JSON.parse(trimmed)
}

// ---------------------------------------------------------------------------
// createSkillFromExecution
// ---------------------------------------------------------------------------

/**
 * Analyse a recorded agent execution via LLM and produce a complete Skill.
 *
 * The LLM is asked to return JSON with:
 *   name (kebab-case), description, categories, parameters, skillMd
 *
 * On JSON-parse failure the function falls back to deriving metadata from the
 * original instruction.
 */
export async function createSkillFromExecution(
  instruction: string,
  steps: AgentReplayStep[],
  startUrl: string,
  provider: LlmProvider,
  signal?: AbortSignal,
): Promise<Skill> {
  const summary = summariseSteps(steps)
  const now = Date.now()

  const prompt = `You are a skill-metadata generator for a browser automation agent.

The user gave this instruction: "${instruction}"
The agent executed the following steps on ${startUrl}:

${summary}

Analyse the steps and return a single JSON object (no markdown fences) with these fields:
- "name": a short kebab-case identifier (max 60 chars)
- "description": a one-sentence human-readable description of what the skill does
- "categories": an array of 1-3 category strings (e.g. "forms", "navigation", "data-entry")
- "parameters": an array of parameter objects, each with:
    - "name": string
    - "type": one of "string", "number", "boolean", "select"
    - "description": string
    - "required": boolean
  Identify any values that look like they should be user-configurable (emails, names, URLs, search terms, etc.)
- "skillMd": a Markdown document (as a single string with \\n newlines) that describes the skill's purpose and expected behaviour. Do NOT include a Parameters section — parameters are stored separately. This will be shown to the agent when replaying.

Return ONLY the JSON object, nothing else.`

  const messages: LlmRequestMessage[] = [
    { role: 'user', content: prompt },
  ]

  let name: string
  let description: string
  let categories: string[]
  let parameters: SkillParameter[]
  let skillMd: string

  try {
    const raw = await collectStreamText(provider, messages, signal)
    const parsed = parseJsonResponse(raw)

    name = (parsed.name as string) || deriveNameFromInstruction(instruction)
    description = (parsed.description as string) || instruction
    categories = Array.isArray(parsed.categories)
      ? (parsed.categories as string[])
      : []
    parameters = Array.isArray(parsed.parameters)
      ? (parsed.parameters as SkillParameter[])
      : []
    skillMd = (parsed.skillMd as string) || `# ${name}\n\n${description}`
  } catch {
    // Fallback: derive metadata from the instruction directly
    name = deriveNameFromInstruction(instruction)
    description = instruction
    categories = []
    parameters = []
    skillMd = `# ${name}\n\n${description}`
  }

  return {
    id: crypto.randomUUID(),
    name,
    description,
    version: 1,
    categories,
    parameters,
    author: 'agent',
    createdAt: now,
    updatedAt: now,
    skillMd,
    steps,
    startUrl,
    score: 1,
    status: 'active',
    totalRuns: 1,
    successCount: 1,
    source: 'user',
    instruction: '',
    configSignature: '',
  }
}

// ---------------------------------------------------------------------------
// createSkillManual
// ---------------------------------------------------------------------------

/**
 * Create a Skill from user-provided metadata — no LLM call.
 */
export function createSkillManual(
  name: string,
  description: string,
  steps: AgentReplayStep[],
  startUrl: string,
): Skill {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    name,
    description,
    version: 1,
    categories: [],
    parameters: [],
    author: 'user',
    createdAt: now,
    updatedAt: now,
    skillMd: `# ${name}\n\n${description}`,
    steps,
    startUrl,
    score: 1,
    status: 'active',
    totalRuns: 0,
    successCount: 0,
    source: 'user',
    instruction: '',
    configSignature: '',
  }
}

// ---------------------------------------------------------------------------
// createAutoSkill
// ---------------------------------------------------------------------------

/**
 * Create an auto-skill (formerly AgentCache entry) from a completed agent execution.
 * No LLM call — purely synchronous metadata derivation.
 */
export function createAutoSkill(
  instruction: string,
  steps: AgentReplayStep[],
  startUrl: string,
  configSignature: string,
): Skill {
  const now = Date.now()
  const normalized = instruction.trim().toLowerCase()
  return {
    id: crypto.randomUUID(),
    name: instruction.slice(0, 60),
    description: instruction,
    version: 1,
    categories: [],
    parameters: [],
    author: 'agent',
    createdAt: now,
    updatedAt: now,
    skillMd: '# Auto-skill\n\n' + instruction,
    steps,
    startUrl,
    score: 1,
    status: 'active',
    totalRuns: 1,
    successCount: 1,
    source: 'auto',
    instruction: normalized,
    configSignature,
  }
}

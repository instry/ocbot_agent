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

const PRIMITIVE_TYPES = new Set(['navigate', 'scroll', 'wait'])

/** Mark deterministic steps as primitive so they skip L2 heal on failure. */
function markPrimitiveSteps(steps: AgentReplayStep[]): AgentReplayStep[] {
  return steps.map(step =>
    PRIMITIVE_TYPES.has(step.type) ? { ...step, primitive: true } : step,
  )
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

/** Strip optional markdown code fences from raw LLM output. */
function stripCodeFences(raw: string): string {
  let trimmed = raw.trim()
  const fenceMatch = trimmed.match(/^```(?:markdown|yaml|md)?\s*\n?([\s\S]*?)\n?\s*```$/)
  if (fenceMatch) {
    trimmed = fenceMatch[1].trim()
  }
  return trimmed
}

// ---------------------------------------------------------------------------
// SKILL.md parser
// ---------------------------------------------------------------------------

export interface ParsedSkillMd {
  name: string
  description: string
  triggerPhrases: string[]
  startUrl: string
  categories: string[]
  parameters: SkillParameter[]
  body: string          // markdown body after frontmatter
  raw: string           // full original text (frontmatter + body)
}

export interface ValidationResult {
  valid: boolean
  warnings: string[]
}

/** Parse a SKILL.md document with YAML frontmatter + markdown body. */
export function parseSkillMd(raw: string): ParsedSkillMd | null {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) return null

  const fmText = fmMatch[1]
  const body = raw.slice(fmMatch[0].length).trim()

  // Simple YAML parser — handles scalars, arrays, and nested object arrays (parameters)
  let name = ''
  let description = ''
  let startUrl = ''
  const triggerPhrases: string[] = []
  const categories: string[] = []
  const parameters: SkillParameter[] = []

  const lines = fmText.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Top-level scalar: "key: value"
    const scalarMatch = line.match(/^(\w+):\s+(.+)$/)
    if (scalarMatch) {
      const [, key, val] = scalarMatch
      const unquoted = val.replace(/^["']|["']$/g, '')
      switch (key) {
        case 'name': name = unquoted; break
        case 'description': description = unquoted; break
        case 'startUrl': startUrl = unquoted; break
      }
      i++
      continue
    }

    // Array or nested block: "key:"
    const blockMatch = line.match(/^(\w+):\s*$/)
    if (blockMatch) {
      const key = blockMatch[1]
      i++

      if (key === 'parameters') {
        // Parse nested object array: each item starts with "  - name: ..."
        while (i < lines.length && /^\s+-\s/.test(lines[i])) {
          const param: Partial<SkillParameter> = {}
          // First line of block: "  - name: value"
          const firstLine = lines[i].match(/^\s+-\s+(\w+):\s+(.+)$/)
          if (firstLine) {
            const pKey = firstLine[1]
            const pVal = firstLine[2].replace(/^["']|["']$/g, '')
            if (pKey === 'name') param.name = pVal
            else if (pKey === 'type') param.type = pVal as SkillParameter['type']
            else if (pKey === 'description') param.description = pVal
            else if (pKey === 'required') param.required = pVal === 'true'
          }
          i++
          // Continuation lines: "    key: value" (deeper indent, no dash)
          while (i < lines.length && /^\s{4,}\w+:/.test(lines[i]) && !/^\s+-/.test(lines[i])) {
            const contMatch = lines[i].match(/^\s+(\w+):\s+(.+)$/)
            if (contMatch) {
              const pKey = contMatch[1]
              const pVal = contMatch[2].replace(/^["']|["']$/g, '')
              if (pKey === 'name') param.name = pVal
              else if (pKey === 'type') param.type = pVal as SkillParameter['type']
              else if (pKey === 'description') param.description = pVal
              else if (pKey === 'required') param.required = pVal === 'true'
            }
            i++
          }
          if (param.name) {
            parameters.push({
              name: param.name,
              type: param.type || 'string',
              description: param.description || '',
              required: param.required ?? false,
            })
          }
        }
      } else {
        // Simple array: "  - value"
        while (i < lines.length && /^\s+-\s/.test(lines[i])) {
          const itemMatch = lines[i].match(/^\s+-\s+(.+)$/)
          if (itemMatch) {
            const val = itemMatch[1].replace(/^["']|["']$/g, '')
            if (key === 'triggerPhrases') triggerPhrases.push(val)
            else if (key === 'categories') categories.push(val)
          }
          i++
        }
      }
      continue
    }

    i++
  }

  if (!name && !description) return null

  return {
    name,
    description,
    triggerPhrases,
    startUrl,
    categories,
    parameters,
    body,
    raw,
  }
}

/** Validate a parsed SKILL.md. Warnings don't block saving. */
export function validateSkillMd(parsed: ParsedSkillMd): ValidationResult {
  const warnings: string[] = []

  if (!parsed.name) warnings.push('missing name')
  else if (parsed.name.length > 60) warnings.push('name exceeds 60 chars')

  if (!parsed.description) warnings.push('missing description')
  else if (parsed.description.length <= 20) warnings.push('description too short (≤20 chars)')

  if (!parsed.triggerPhrases || parsed.triggerPhrases.length < 3) {
    warnings.push('fewer than 3 triggerPhrases')
  }

  if (!parsed.body.includes('## Workflow')) {
    warnings.push('body missing ## Workflow section')
  }

  if (!parsed.startUrl) warnings.push('missing startUrl')

  return { valid: warnings.length === 0, warnings }
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildSkillMdPrompt(instruction: string, startUrl: string, summary: string): string {
  return `You are a skill-metadata generator for a browser automation agent.

The user gave this instruction: "${instruction}"
The agent executed the following steps on ${startUrl}:

${summary}

Generate a SKILL.md document. Output ONLY the document, nothing else.

## Output Rules

Writing style: Use imperative/infinitive form ("Navigate to...", "Click the button").
Do NOT use second person ("you should", "you need to").
Be concrete: include specific URLs, selectors, text to look for.

description: Must state BOTH what the skill does AND when to use it.

triggerPhrases: Generate 3-5 phrases a user would actually say to trigger this skill.
Include: Chinese + English variations, different wordings, common abbreviations.

parameters: Actively identify user-configurable values from the steps:
search terms, usernames, URLs, quantities, dates, email addresses, etc.
Mark as required if the skill cannot run without them.

Workflow: Each step should be concrete enough that an LLM can re-execute it
from the SKILL.md alone (used during Agent Track and L3 self-heal).

## Output Structure

---
name: <kebab-case-name, max 60 chars>
description: <what it does + when to use it>
triggerPhrases:
  - "<phrase>"
...
startUrl: "${startUrl}"
categories:
  - <category>
parameters:
  - name: <param_name>
    type: string|number|boolean|select
    description: "<description>"
    required: true|false
---

# <Skill Title>

## Workflow
1. <step>
...

## Preconditions
- <precondition>

## Success Criteria
- <criterion>

## Notes
- <edge case or limitation>`
}

// ---------------------------------------------------------------------------
// Fallback skill builder
// ---------------------------------------------------------------------------

function buildFallbackSkill(
  instruction: string,
  steps: AgentReplayStep[],
  startUrl: string,
): Skill {
  const now = Date.now()
  const name = deriveNameFromInstruction(instruction)
  return {
    id: crypto.randomUUID(),
    name,
    description: instruction,
    version: 1,
    categories: [],
    parameters: [],
    triggerPhrases: [],
    author: 'agent',
    createdAt: now,
    updatedAt: now,
    skillMd: `# ${name}\n\n${instruction}`,
    steps: markPrimitiveSteps(steps),
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
// createSkillFromExecution
// ---------------------------------------------------------------------------

/**
 * Analyse a recorded agent execution via LLM and produce a complete Skill.
 *
 * The LLM outputs a structured SKILL.md (YAML frontmatter + markdown body).
 * On parse failure the function falls back to deriving metadata from the
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
  const prompt = buildSkillMdPrompt(instruction, startUrl, summary)
  const now = Date.now()

  try {
    const raw = await collectStreamText(provider, [{ role: 'user', content: prompt }], signal)
    const parsed = parseSkillMd(stripCodeFences(raw))

    if (parsed) {
      const { warnings } = validateSkillMd(parsed)
      if (warnings.length) console.warn('[skill-create] validation warnings:', warnings)

      return {
        id: crypto.randomUUID(),
        name: parsed.name || deriveNameFromInstruction(instruction),
        description: parsed.description || instruction,
        triggerPhrases: parsed.triggerPhrases || [],
        version: 1,
        categories: parsed.categories || [],
        parameters: parsed.parameters || [],
        author: 'agent',
        createdAt: now,
        updatedAt: now,
        skillMd: parsed.raw,
        steps: markPrimitiveSteps(steps),
        startUrl: parsed.startUrl || startUrl,
        status: 'active',
        totalRuns: 1,
        successCount: 1,
        source: 'user',
        instruction: '',
        configSignature: '',
      }
    }
  } catch {
    // Fallback below
  }

  return buildFallbackSkill(instruction, steps, startUrl)
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
    triggerPhrases: [],
    author: 'user',
    createdAt: now,
    updatedAt: now,
    skillMd: `# ${name}\n\n${description}`,
    steps: markPrimitiveSteps(steps),
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
    triggerPhrases: [],
    author: 'agent',
    createdAt: now,
    updatedAt: now,
    skillMd: `---\nname: ${instruction.slice(0, 60)}\ndescription: ${instruction}\nstartUrl: "${startUrl}"\n---\n\n# Auto-skill\n\n## Workflow\n1. ${instruction}\n`,
    steps: markPrimitiveSteps(steps),
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

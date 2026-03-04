// lib/skills/matcher.ts
import type { Skill, SkillMatch } from './types'
import type { SkillStore } from './store'
import type { LlmProvider } from '@/lib/llm/types'
import { streamChat } from '@/lib/llm/client'

/**
 * Phase 1: URL-based quick match (no LLM, instant).
 *
 * If `currentUrl` matches a skill's `startUrl` hostname AND the user message
 * contains words from the skill name (words >= 3 chars), return a strong match.
 */
function urlMatch(skills: Skill[], userMessage: string, currentUrl: string): SkillMatch | null {
  let currentHostname: string
  try {
    currentHostname = new URL(currentUrl).hostname.toLowerCase()
  } catch {
    return null
  }

  const msgLower = userMessage.toLowerCase()

  for (const skill of skills) {
    let skillHostname: string
    try {
      skillHostname = new URL(skill.startUrl).hostname.toLowerCase()
    } catch {
      continue
    }

    if (currentHostname !== skillHostname) continue

    // Check if user message contains any word from skill name (>= 3 chars)
    const nameWords = skill.name
      .split(/\s+/)
      .map((w) => w.toLowerCase())
      .filter((w) => w.length >= 3)

    const hasNameWord = nameWords.some((word) => msgLower.includes(word))
    if (hasNameWord) {
      return { skill, confidence: 'strong' }
    }
  }

  return null
}

/**
 * Strip markdown code fences from a string so we can parse raw JSON.
 * Handles ```json ... ``` and ``` ... ``` patterns.
 */
function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
}

/**
 * Phase 2: LLM semantic match.
 *
 * Sends a compact skill list to the LLM and asks whether the user's intent
 * matches any skill. Returns a weak or strong match, or null.
 */
async function llmMatch(
  skills: Skill[],
  userMessage: string,
  provider: LlmProvider,
  signal?: AbortSignal,
): Promise<SkillMatch | null> {
  const compactList = skills.slice(0, 30).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    startUrl: s.startUrl,
  }))

  const prompt = [
    'You are a skill matcher. Given the user message and the list of available skills, determine if the user\'s intent matches any skill.',
    '',
    'Skills:',
    JSON.stringify(compactList),
    '',
    `User message: "${userMessage}"`,
    '',
    'If a skill matches, respond with JSON: {"id": "<skill_id>", "confidence": "strong"|"weak"}',
    'If no skill matches, respond with JSON: {"id": null}',
    'Respond ONLY with the JSON object, nothing else.',
  ].join('\n')

  let responseText = ''

  const stream = streamChat(
    provider,
    [{ role: 'user', content: prompt }],
    undefined,
    signal,
  )

  for await (const event of stream) {
    if (event.type === 'text_delta') {
      responseText += event.text
    } else if (event.type === 'error') {
      console.warn('[SkillMatcher] LLM error:', event.error)
      return null
    }
  }

  try {
    const cleaned = stripCodeFences(responseText)
    const parsed = JSON.parse(cleaned) as { id: string | null; confidence?: 'strong' | 'weak' }

    if (!parsed.id) return null

    const matched = skills.find((s) => s.id === parsed.id)
    if (!matched) return null

    return {
      skill: matched,
      confidence: parsed.confidence === 'strong' ? 'strong' : 'weak',
    }
  } catch {
    console.warn('[SkillMatcher] Failed to parse LLM response:', responseText)
    return null
  }
}

/**
 * Match a user message against installed skills.
 *
 * Runs two phases:
 * 1. URL-based quick match (instant, no LLM)
 * 2. LLM semantic match (if URL match fails)
 */
export async function matchSkill(
  userMessage: string,
  currentUrl: string,
  provider: LlmProvider,
  store: SkillStore,
  signal?: AbortSignal,
): Promise<SkillMatch | null> {
  const allSkills = await store.list()
  const activeSkills = allSkills.filter((s) => s.status === 'active' && s.source !== 'auto')

  if (activeSkills.length === 0) return null

  // Phase 1: URL-based quick match
  const quick = urlMatch(activeSkills, userMessage, currentUrl)
  if (quick) return quick

  // Phase 2 skipped — URL match is sufficient for installed skills
  // llmMatch kept in file for potential future re-enablement behind a flag
  return null
}

/**
 * Match a user instruction against auto-skills (exact match on normalized instruction + configSignature).
 * Touches updatedAt on hit to keep LRU fresh.
 */
function safeHostname(url: string): string {
  try { return new URL(url).hostname.toLowerCase() }
  catch { return '' }
}

export async function matchAutoSkill(
  instruction: string,
  configSignature: string,
  currentUrl: string,
  store: SkillStore,
): Promise<Skill | null> {
  const allSkills = await store.list()
  const normalized = instruction.trim().toLowerCase()
  const hostname = safeHostname(currentUrl)

  const match = allSkills.find(
    (s) =>
      s.source === 'auto' &&
      s.status === 'active' &&
      s.instruction === normalized &&
      s.configSignature === configSignature &&
      // Skip hostname check if the skill starts with a navigate step
      // (the skill will navigate to the right page regardless of starting URL)
      (s.steps[0]?.type === 'navigate' ||
        (hostname !== '' && safeHostname(s.startUrl) === hostname)),
  )

  if (!match) return null

  // Touch updatedAt to keep LRU fresh
  const updated: Skill = { ...match, updatedAt: Date.now() }
  await store.saveAutoSkill(updated)
  return updated
}

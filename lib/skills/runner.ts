// lib/skills/runner.ts
import type { AgentReplayStep, HealEvent, ReplayCallbacks } from '@/lib/agent/agentCache'
import type { LlmProvider, LlmRequestMessage } from '@/lib/llm/types'
import type { ActCache } from '@/lib/agent/cache'
import type { Variables } from '@/lib/agent/variables'
import type { AgentCallbacks } from '@/lib/agent/loop'
import type { Skill, SkillExecution, SkillRunCallbacks, SkillRunResult } from './types'
import { replayAgentSteps } from '@/lib/agent/agentCache'
import { runAgentLoop } from '@/lib/agent/loop'
import { SkillStore } from './store'
import { healStep, healSegment } from './heal'
import { getFragileStepIndices } from './fragility'
import { logDebug } from '@/lib/debug/eventLog'

const MAX_SKILL_DEPTH = 5

/**
 * Replace `%paramName%` placeholders in a string with parameter values.
 */
function substituteParams(text: string, params: Record<string, string>): string {
  return text.replace(/%([a-zA-Z_][a-zA-Z0-9_]*)%/g, (match, key) => {
    return key in params ? params[key] : match
  })
}

/**
 * Resolve a parameter map value: `%varName%` → lookup from variables/params, otherwise literal.
 */
function resolveParamValue(value: string, variables?: Variables): string {
  if (!variables) return value
  const match = value.match(/^%([a-zA-Z_][a-zA-Z0-9_]*)%$/)
  if (match) {
    const key = match[1]
    if (key in variables) return variables[key]
  }
  // Support inline %param% replacement for mixed strings like "prefix_%var%_suffix"
  if (value.includes('%')) {
    return substituteParams(value, variables)
  }
  return value
}

/**
 * Apply parameter substitution to all steps, returning new step objects.
 */
function substituteStepParams(
  steps: AgentReplayStep[],
  params: Record<string, string>,
): AgentReplayStep[] {
  return steps.map((step) => {
    switch (step.type) {
      case 'act':
        return { ...step, instruction: substituteParams(step.instruction, params) }
      case 'navigate':
        return { ...step, url: substituteParams(step.url, params) }
      case 'fillForm':
        return {
          ...step,
          fields: step.fields.map((f) => ({
            ...f,
            value: substituteParams(f.value, params),
          })),
        }
      case 'skill':
        return {
          ...step,
          parameterMap: Object.fromEntries(
            Object.entries(step.parameterMap).map(([k, v]) => [k, substituteParams(v, params)])
          ),
        }
      default:
        return step
    }
  })
}

export class SkillRunner {
  private store: SkillStore

  constructor(store?: SkillStore) {
    this.store = store ?? new SkillStore()
  }

  /**
   * Execute fast-track only (no agent-track fallback).
   * Used by the auto-skill flow to prevent recursion when called from within the LLM loop.
   */
  async executeFastTrackOnly(
    skill: Skill,
    parameters: Record<string, string>,
    provider: LlmProvider,
    cache: ActCache,
    callbacks: SkillRunCallbacks,
    signal?: AbortSignal,
    variables?: Variables,
    depth: number = 0,
    skillCallStack: string[] = [],
  ): Promise<SkillRunResult> {
    const result = await this.runFastTrack(skill, parameters, provider, cache, callbacks, signal, variables, depth, skillCallStack)
    await this.recordExecution(skill, parameters, result)
    return result
  }

  /**
   * Execute a skill using dual-track strategy:
   * 1. Fast Track — replay cached steps if available.
   * 2. Agent Track — full LLM loop as fallback.
   */
  async execute(
    skill: Skill,
    parameters: Record<string, string>,
    provider: LlmProvider,
    cache: ActCache,
    callbacks: SkillRunCallbacks,
    signal?: AbortSignal,
    variables?: Variables,
    depth: number = 0,
    skillCallStack: string[] = [],
  ): Promise<SkillRunResult> {
    const startTime = Date.now()

    let result: SkillRunResult

    // --- Fast Track ---
    if (skill.steps.length > 0) {
      logDebug('execution', 'Track: fast')
      result = await this.runFastTrack(skill, parameters, provider, cache, callbacks, signal, variables, depth, skillCallStack)

      if (result.success) {
        await this.recordExecution(skill, parameters, result)
        return result
      }

      // Fast track failed — switch to agent track
      callbacks.onTrackSwitch('fast', 'agent')
      const agentResult = await this.runAgentTrack(skill, parameters, provider, cache, callbacks, signal, variables)
      // Mark as hybrid since we attempted fast first
      agentResult.track = 'hybrid'
      agentResult.durationMs = Date.now() - startTime
      await this.recordExecution(skill, parameters, agentResult)
      return agentResult
    }

    // --- Agent Track (no steps available) ---
    logDebug('execution', 'Track: agent')
    result = await this.runAgentTrack(skill, parameters, provider, cache, callbacks, signal, variables)
    result.durationMs = Date.now() - startTime
    await this.recordExecution(skill, parameters, result)
    return result
  }

  /**
   * Fast Track: Replay stored steps with parameter substitution.
   */
  private async runFastTrack(
    skill: Skill,
    parameters: Record<string, string>,
    provider: LlmProvider,
    cache: ActCache,
    callbacks: SkillRunCallbacks,
    signal?: AbortSignal,
    variables?: Variables,
    depth: number = 0,
    skillCallStack: string[] = [],
  ): Promise<SkillRunResult> {
    const startTime = Date.now()
    const steps = substituteStepParams(skill.steps, parameters)

    // Dynamic import to avoid circular dependency
    const { executeTool } = await import('@/lib/agent/tools')

    const executeForReplay = (name: string, argsJson: string) => {
      if (name === 'skill') {
        return this.executeSubSkill(
          argsJson, provider, cache, callbacks, signal, variables, depth, skillCallStack,
        )
      }
      return executeTool(name, argsJson, provider, cache, signal, variables, { skillReplay: true })
    }

    const replayCallbacks: ReplayCallbacks = {
      onStepStart: (i, step) => callbacks.onStepStart(i, step),
      onStepEnd: (i, step, result) => callbacks.onStepEnd(i, step, result),
      onSkip: () => { /* no-op */ },
    }

    // L2 heal function: re-infer a single failed step via LLM
    const healFn = async (failedStep: AgentReplayStep, _stepIndex: number) => {
      return healStep(failedStep, provider)
    }

    const replayResult = await replayAgentSteps(steps, executeForReplay, replayCallbacks, signal, healFn)

    // Notify heal events
    for (const event of replayResult.healEvents) {
      callbacks.onHeal(event)
    }

    // L3: If replay failed (L2 already tried via healFn), attempt segment repair
    if (!replayResult.success) {
      logDebug('L3', 'Attempting segment repair', { failedIndex: replayResult.failedIndex })
      const l3Steps = await healSegment(steps, replayResult.failedIndex, skill.skillMd, provider)

      if (l3Steps && l3Steps.length > 0) {
        // Execute L3 re-planned steps via replay (with L2 heal enabled)
        const l3ReplayResult = await replayAgentSteps(l3Steps, executeForReplay, replayCallbacks, signal, healFn)

        for (const event of l3ReplayResult.healEvents) {
          callbacks.onHeal({ ...event, level: Math.max(event.level, 3) })
        }

        if (l3ReplayResult.success) {
          // Merge completed original steps + L3 steps for evolution
          const mergedSteps = [...steps.slice(0, replayResult.failedIndex), ...l3Steps]
          const result: SkillRunResult = {
            success: true,
            track: 'fast',
            healEvents: [
              ...replayResult.healEvents,
              {
                stepIndex: replayResult.failedIndex,
                level: 3,
                reason: 'l3_segment_repair',
                resolved: true,
                tokenCost: 2000,
                durationMs: Date.now() - startTime,
              },
              ...l3ReplayResult.healEvents,
            ],
            completedSteps: mergedSteps.length,
            totalSteps: mergedSteps.length,
            durationMs: Date.now() - startTime,
            updatedSteps: mergedSteps,
          }
          // Evolve with new steps (version bump)
          await this.evolveSkill(skill, mergedSteps)
          return result
        }
      }

      // L3 also failed — return original failure
      return {
        success: false,
        track: 'fast' as const,
        healEvents: replayResult.healEvents,
        completedSteps: replayResult.failedIndex,
        totalSteps: steps.length,
        durationMs: Date.now() - startTime,
      }
    }

    const result: SkillRunResult = {
      success: true,
      track: 'fast',
      healEvents: replayResult.healEvents,
      completedSteps: steps.length,
      totalSteps: steps.length,
      durationMs: Date.now() - startTime,
    }

    // Evolution: if successful with heal events, update skill steps
    if (replayResult.healEvents.length > 0) {
      result.updatedSteps = steps
      await this.evolveSkill(skill, steps)
    }

    return result
  }

  /**
   * Agent Track: Build a prompt from skillMd + parameters, run full LLM loop.
   */
  private async runAgentTrack(
    skill: Skill,
    parameters: Record<string, string>,
    provider: LlmProvider,
    cache: ActCache,
    callbacks: SkillRunCallbacks,
    signal?: AbortSignal,
    variables?: Variables,
  ): Promise<SkillRunResult> {
    const startTime = Date.now()

    // Build the user message from skillMd with parameter substitution
    let prompt = substituteParams(skill.skillMd, parameters)

    // Append parameter context if any
    const paramEntries = Object.entries(parameters)
    if (paramEntries.length > 0) {
      const paramBlock = paramEntries
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n')
      prompt += `\n\nParameters:\n${paramBlock}`
    }

    const messages: LlmRequestMessage[] = [
      { role: 'user', content: prompt },
    ]

    // Bridge SkillRunCallbacks to AgentCallbacks
    const agentCallbacks: AgentCallbacks = {
      onTextDelta: (text) => callbacks.onTextDelta(text),
      onToolCallStart: () => { /* not surfaced in skill callbacks */ },
      onToolCallEnd: () => { /* not surfaced in skill callbacks */ },
      onAssistantMessage: () => { /* not surfaced in skill callbacks */ },
      onToolMessage: () => { /* not surfaced in skill callbacks */ },
      onError: () => { /* errors handled via result */ },
    }

    let success = true
    try {
      await runAgentLoop(provider, messages, agentCallbacks, signal, cache, variables)
    } catch {
      success = false
    }

    return {
      success,
      track: 'agent',
      healEvents: [],
      completedSteps: 0,
      totalSteps: 0,
      durationMs: Date.now() - startTime,
    }
  }

  /**
   * Execute a sub-skill referenced by a 'skill' step.
   * Handles depth limiting, circular dependency detection, parameter mapping, and recursive execution.
   */
  private async executeSubSkill(
    argsJson: string,
    provider: LlmProvider,
    cache: ActCache,
    callbacks: SkillRunCallbacks,
    signal?: AbortSignal,
    variables?: Variables,
    depth: number = 0,
    skillCallStack: string[] = [],
  ): Promise<string> {
    const { skillId, parameterMap } = JSON.parse(argsJson) as {
      skillId: string
      parameterMap: Record<string, string>
    }
    const nextDepth = depth + 1

    // Depth check
    if (nextDepth > MAX_SKILL_DEPTH) {
      return JSON.stringify({ success: false, error: `Skill nesting too deep (max ${MAX_SKILL_DEPTH})` })
    }

    // Circular dependency check
    if (skillCallStack.includes(skillId)) {
      return JSON.stringify({
        success: false,
        error: `Circular skill dependency: ${[...skillCallStack, skillId].join(' → ')}`,
      })
    }

    // Load child skill
    const childSkill = await this.store.get(skillId)
    if (!childSkill) {
      return JSON.stringify({ success: false, error: `Skill not found: ${skillId}` })
    }

    // Map parameters from parent to child
    const childParams: Record<string, string> = {}
    for (const [childKey, parentRef] of Object.entries(parameterMap)) {
      childParams[childKey] = resolveParamValue(parentRef, variables)
    }

    // Recursive execute
    const runner = new SkillRunner(this.store)
    const result = await runner.execute(
      childSkill, childParams, provider, cache, callbacks,
      signal, variables, nextDepth, [...skillCallStack, skillId],
    )

    return JSON.stringify({
      success: result.success,
      track: result.track,
      durationMs: result.durationMs,
      completedSteps: result.completedSteps,
      totalSteps: result.totalSteps,
    })
  }

  /**
   * Evolve skill steps after a successful fast-track run that required healing.
   */
  private async evolveSkill(skill: Skill, updatedSteps: AgentReplayStep[]): Promise<void> {
    const updated: Skill = {
      ...skill,
      steps: updatedSteps,
      version: skill.version + 1,
      updatedAt: Date.now(),
    }
    await this.store.save(updated)
  }

  /**
   * Record execution and update skill metrics.
   */
  private async recordExecution(
    skill: Skill,
    parameters: Record<string, string>,
    result: SkillRunResult,
  ): Promise<void> {
    // Build execution record
    const primitiveCount = skill.steps.filter(s => 'primitive' in s && s.primitive).length
    const primitiveRatio = skill.steps.length > 0 ? primitiveCount / skill.steps.length : 0
    const execution: SkillExecution = {
      id: `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      skillId: skill.id,
      skillVersion: skill.version,
      timestamp: Date.now(),
      track: result.track,
      healEvents: result.healEvents,
      totalSteps: result.totalSteps,
      completedSteps: result.completedSteps,
      success: result.success,
      url: skill.startUrl,
      parameters,
      durationMs: result.durationMs,
      primitiveRatio,
    }

    await this.store.addExecution(execution)

    // Update skill metrics
    const executions = await this.store.getExecutions(skill.id)
    const score = this.store.computeScore(executions)
    const totalRuns = skill.totalRuns + 1
    const successCount = skill.successCount + (result.success ? 1 : 0)

    // Determine status from score
    let status: 'active' | 'degraded' | 'archived' = 'active'
    if (score < 0.3) {
      status = 'archived'
    } else if (score < 0.6) {
      status = 'degraded'
    }

    // Compute fragile steps
    const fragileSteps = getFragileStepIndices(executions, skill.steps.length)
    if (fragileSteps.length > 0) {
      logDebug('fragility', 'Fragile steps', { indices: fragileSteps })
    }

    const updated: Skill = {
      ...skill,
      totalRuns,
      successCount,
      score,
      status,
      fragileSteps,
      updatedAt: Date.now(),
    }
    await this.store.save(updated)
  }
}

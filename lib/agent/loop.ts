import type { LlmProvider, LlmRequestMessage, ToolCallPart } from '../llm/types'
import type { ActCache } from './cache'
import type { Variables } from './variables'
import { streamChat } from '../llm/client'
import { BROWSER_TOOLS, executeTool } from './tools'
import { buildSystemPrompt } from './systemPrompt'
import { capturePageSnapshot } from './snapshot'
import { ensureAttached } from './cdp'
import {
  type AgentReplayStep,
  toolCallToReplayStep,
  getConfigSignature,
} from './agentCache'
import { matchSkill, matchAutoSkill } from '@/lib/skills/matcher'
import { createAutoSkill } from '@/lib/skills/create'
import { SkillStore } from '@/lib/skills/store'
import { SkillRunner } from '@/lib/skills/runner'
import type { SkillMatch } from '@/lib/skills/types'

const MAX_TURNS = 100

export interface AgentCallbacks {
  onTextDelta: (text: string) => void
  onToolCallStart: (id: string, name: string) => void
  onToolCallEnd: (id: string, name: string, result: string) => void
  onAssistantMessage: (content: string, toolCalls: ToolCallPart[]) => void
  onToolMessage: (toolCallId: string, name: string, result: string) => void
  onError: (error: string) => void
  onSkillMatch?: (match: SkillMatch) => Promise<boolean> // return true to execute skill
  onRecordedSteps?: (steps: AgentReplayStep[], instruction: string, startUrl: string) => void
}

async function getPageContext(): Promise<{ url: string; title: string } | undefined> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.url && tab?.title) {
      return { url: tab.url, title: tab.title }
    }
  } catch { /* no context available */ }
  return undefined
}

export async function runAgentLoop(
  provider: LlmProvider,
  messages: LlmRequestMessage[],
  callbacks: AgentCallbacks,
  signal?: AbortSignal,
  cache?: ActCache,
  variables?: Variables,
): Promise<void> {
  const pageContext = await getPageContext()

  // Auto-capture ariaTree for the current page so the agent can act immediately
  let initialAriaTree: string | undefined
  if (pageContext?.url) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const tabId = tab?.id
      if (tabId) {
        await ensureAttached(tabId)
        const snapshot = await capturePageSnapshot(tabId)
        const maxLen = 70000
        initialAriaTree = snapshot.tree.length > maxLen
          ? snapshot.tree.slice(0, maxLen) + '\n... (truncated)'
          : snapshot.tree
      }
    } catch { /* best effort */ }
  }

  const systemMessage: LlmRequestMessage = {
    role: 'system',
    content: buildSystemPrompt(pageContext, variables, initialAriaTree),
  }

  // Extract the user instruction (last user message) for skill matching
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
  const userInstruction = lastUserMsg?.content || ''
  const startUrl = pageContext?.url || ''
  const configSig = getConfigSignature(provider)
  const skillStore = new SkillStore()

  // --- Skill matching (user skills) ---
  if (userInstruction) {
    const skillMatch = await matchSkill(
      userInstruction,
      startUrl,
      provider,
      skillStore,
      signal,
    )

    if (skillMatch && callbacks.onSkillMatch) {
      const shouldRun = await callbacks.onSkillMatch(skillMatch)
      if (shouldRun) {
        const runner = new SkillRunner(skillStore)
        const result = await runner.execute(
          skillMatch.skill,
          variables ?? {},
          provider,
          cache!,
          {
            onStepStart: (i, step) => callbacks.onToolCallStart(`skill-step-${i}`, step.type),
            onStepEnd: (i, step, res) => callbacks.onToolCallEnd(`skill-step-${i}`, step.type, res),
            onTrackSwitch: () => {},
            onHeal: () => {},
            onTextDelta: callbacks.onTextDelta,
          },
          signal,
          variables,
        )

        if (result.success) {
          callbacks.onTextDelta(
            `Skill "${skillMatch.skill.name}" completed successfully (${result.track} track, ${result.durationMs}ms).`,
          )
          callbacks.onAssistantMessage(
            `Skill "${skillMatch.skill.name}" completed successfully (${result.track} track, ${result.durationMs}ms).`,
            [],
          )
          return
        }
        // Skill failed — fall through to normal agent loop
        console.log('[ocbot] Skill execution failed, falling back to agent loop')
      }
    }
  }

  // --- Auto-skill replay (replaces AgentCache) ---
  if (userInstruction) {
    const autoSkill = await matchAutoSkill(userInstruction, configSig, skillStore)
    if (autoSkill?.steps.length) {
      console.log('[ocbot] Auto-skill hit, replaying', autoSkill.steps.length, 'steps')
      const runner = new SkillRunner(skillStore)
      const result = await runner.executeFastTrackOnly(
        autoSkill,
        {},
        provider,
        cache!,
        {
          onStepStart: (i, step) => callbacks.onToolCallStart(`replay_${i}`, step.type),
          onStepEnd: (i, step, res) => callbacks.onToolCallEnd(`replay_${i}`, step.type, res),
          onTrackSwitch: () => {},
          onHeal: () => {},
          onTextDelta: callbacks.onTextDelta,
        },
        signal,
        variables,
      )

      if (result.success) {
        callbacks.onTextDelta('Task completed successfully (from auto-skill).')
        callbacks.onAssistantMessage('Task completed successfully (from auto-skill).', [])
        return
      }
      // Auto-skill failed — fall through to normal LLM loop
      console.log('[ocbot] Auto-skill replay failed, falling back to LLM')
    }
  }

  // --- Normal LLM loop ---
  const allMessages: LlmRequestMessage[] = [systemMessage, ...messages]
  const recordedSteps: AgentReplayStep[] = []
  // Global tool call counter — ensures unique IDs across all turns
  let globalToolCallIndex = 0

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (signal?.aborted) return

    let textContent = ''
    let reasoningContent = ''
    const toolCalls: Map<string, { id: string; name: string; arguments: string }> = new Map()

    try {
      for await (const event of streamChat(provider, allMessages, BROWSER_TOOLS, signal)) {
        if (signal?.aborted) return

        switch (event.type) {
          case 'text_delta':
            textContent += event.text
            callbacks.onTextDelta(event.text)
            break

          case 'reasoning_delta':
            reasoningContent += event.text
            break

          case 'tool_call_start': {
            const id = event.id || `tc_${globalToolCallIndex}`
            toolCalls.set(id, { id, name: event.name, arguments: '' })
            callbacks.onToolCallStart(id, event.name)
            globalToolCallIndex++
            break
          }

          case 'tool_call_delta': {
            // Find the tool call — try exact id first, then last added
            let tc = toolCalls.get(event.id)
            if (!tc) {
              // For OpenAI, delta may come with empty id — use the last tool call
              const entries = Array.from(toolCalls.values())
              tc = entries[entries.length - 1]
            }
            if (tc) {
              tc.arguments += event.arguments
            }
            break
          }

          case 'error':
            callbacks.onError(event.error)
            return

          case 'done':
            break
        }
      }
    } catch (err: unknown) {
      if (signal?.aborted) return
      const msg = err instanceof Error ? err.message : String(err)
      callbacks.onError(msg)
      return
    }

    const toolCallArray = Array.from(toolCalls.values())

    // Notify assistant message
    callbacks.onAssistantMessage(textContent, toolCallArray)

    // Add assistant message to history
    allMessages.push({
      role: 'assistant',
      content: textContent || undefined,
      toolCalls: toolCallArray.length > 0 ? toolCallArray : undefined,
      reasoningContent: reasoningContent || undefined,
    })

    // If no tool calls, we're done — assistant gave a text response
    if (toolCallArray.length === 0) {
      // Store recorded steps as auto-skill
      if (userInstruction && recordedSteps.length > 0) {
        const autoSkill = createAutoSkill(userInstruction, recordedSteps, startUrl, configSig)
        await skillStore.saveAutoSkill(autoSkill)
      }
      // Expose recorded steps for "Save as Skill"
      if (recordedSteps.length > 0 && userInstruction && callbacks.onRecordedSteps) {
        callbacks.onRecordedSteps(recordedSteps, userInstruction, startUrl)
      }
      return
    }

    // Execute tool calls and add results
    for (const tc of toolCallArray) {
      if (signal?.aborted) return

      const result = await executeTool(tc.name, tc.arguments, provider, cache!, signal, variables)
      callbacks.onToolCallEnd(tc.id, tc.name, result)
      callbacks.onToolMessage(tc.id, tc.name, result)

      allMessages.push({
        role: 'tool',
        content: result,
        toolCallId: tc.id,
      })

      // Record step for agent cache
      try {
        const args = JSON.parse(tc.arguments || '{}')
        const step = toolCallToReplayStep(tc.name, args, result)
        if (step) recordedSteps.push(step)
      } catch { /* skip recording on parse error */ }
    }
  }

  // Safety limit reached — store what we have and send final message
  if (userInstruction && recordedSteps.length > 0) {
    const autoSkill = createAutoSkill(userInstruction, recordedSteps, startUrl, configSig)
    await skillStore.saveAutoSkill(autoSkill)
  }
  if (recordedSteps.length > 0 && userInstruction && callbacks.onRecordedSteps) {
    callbacks.onRecordedSteps(recordedSteps, userInstruction, startUrl)
  }
  callbacks.onAssistantMessage('I\'ve completed the actions I could perform. Let me know if you need anything else.', [])
}

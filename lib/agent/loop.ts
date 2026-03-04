import type { LlmProvider, LlmRequestMessage, ToolCallPart, ContentPart } from '../llm/types'
import type { ActCache } from './cache'
import type { Variables } from './variables'
import { streamChat } from '../llm/client'
import { BROWSER_TOOLS, executeTool } from './tools'
import { buildSystemPrompt } from './systemPrompt'
import { capturePageSnapshot } from './snapshot'
import { ensureAttached, sendCdp } from './cdp'
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
  onToolCallStart: (id: string, name: string, args?: string) => void
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

const TAG = '[ocbot:agent]'

export async function runAgentLoop(
  provider: LlmProvider,
  messages: LlmRequestMessage[],
  callbacks: AgentCallbacks,
  signal?: AbortSignal,
  cache?: ActCache,
  variables?: Variables,
): Promise<void> {
  console.group(`${TAG} ▶ Agent started`)
  const t0 = performance.now()
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
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
  let userInstruction = ''
  const content = lastUserMsg?.content
  if (content) {
    if (typeof content === 'string') {
      userInstruction = content
    } else if (Array.isArray(content)) {
      userInstruction = content
        .map((p) => (p.type === 'text' ? p.text : ''))
        .filter(Boolean)
        .join('\n')
    }
  }
  const startUrl = pageContext?.url || ''
  const configSig = getConfigSignature(provider)
  const skillStore = new SkillStore()
  console.log(`${TAG} instruction: "${userInstruction}"`)
  console.log(`${TAG} page: ${startUrl || '(no page)'}`)
  console.log(`${TAG} provider: ${provider.name} / ${provider.modelId}`)

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
      console.log(`${TAG} 🎯 Skill matched: "${skillMatch.skill.name}" (confidence: ${skillMatch.confidence})`)
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
          console.log(`${TAG} ✅ Skill completed (${result.track} track, ${result.durationMs}ms)`)
          console.groupEnd()
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
        console.log(`${TAG} ❌ Skill execution failed, falling back to agent loop`)
      }
    }
  }

  // --- Auto-skill replay (replaces AgentCache) ---
  if (userInstruction) {
    const autoSkill = await matchAutoSkill(userInstruction, configSig, startUrl, skillStore)
    if (autoSkill?.steps.length) {
      console.log(`${TAG} 🔄 Auto-skill hit, replaying ${autoSkill.steps.length} steps`)
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
        console.log(`${TAG} ✅ Auto-skill replay completed`)
        console.groupEnd()
        callbacks.onTextDelta('Task completed successfully (from auto-skill).')
        callbacks.onAssistantMessage('Task completed successfully (from auto-skill).', [])
        return
      }
      // Auto-skill failed — fall through to normal LLM loop
      console.log(`${TAG} ❌ Auto-skill replay failed, falling back to LLM`)
    }
  }

  // --- Normal LLM loop ---
  console.log(`${TAG} 🤖 Entering LLM loop`)

  const allMessages: LlmRequestMessage[] = [systemMessage, ...messages]
  const recordedSteps: AgentReplayStep[] = []
  // Global tool call counter — ensures unique IDs across all turns
  let globalToolCallIndex = 0

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (signal?.aborted) return
    console.group(`${TAG} Turn ${turn + 1}`)

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
      if (signal?.aborted) { console.groupEnd(); console.groupEnd(); return }
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`${TAG} ❌ Error:`, msg)
      console.groupEnd() // turn
      console.groupEnd() // agent
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
      console.log(`${TAG} 💬 LLM responded with text (no tool calls), done`)
      console.groupEnd() // turn
      console.log(`${TAG} ⏱ Agent finished in ${(performance.now() - t0).toFixed(0)}ms`)
      console.groupEnd() // agent
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
    console.log(`${TAG} 🔧 LLM requested ${toolCallArray.length} tool call(s)`)
    for (const tc of toolCallArray) {
      if (signal?.aborted) return

      let parsedArgs: unknown
      try { parsedArgs = JSON.parse(tc.arguments || '{}') } catch { parsedArgs = tc.arguments }
      console.log(`${TAG}   ┌ ${tc.name}`, parsedArgs)
      // Update tool status with args now that streaming is complete
      callbacks.onToolCallStart(tc.id, tc.name, tc.arguments)
      const toolT0 = performance.now()
      const result = await executeTool(tc.name, tc.arguments, provider, cache!, signal, variables)
      const toolMs = (performance.now() - toolT0).toFixed(0)
      try {
        const parsed = JSON.parse(result)
        console.log(`${TAG}   └ ${tc.name} (${toolMs}ms)`, parsed)
      } catch {
        console.log(`${TAG}   └ ${tc.name} (${toolMs}ms)`, result.slice(0, 200))
      }
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

    // Capture fresh screenshot after page-changing actions for next turn
    const PAGE_CHANGING_TOOLS = new Set(['navigate', 'act', 'scroll', 'waitForNavigation', 'fillForm'])
    const hasPageChange = toolCallArray.some(tc => PAGE_CHANGING_TOOLS.has(tc.name))
    if (hasPageChange) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (tab?.id) {
          await ensureAttached(tab.id)
          const { data } = await sendCdp<{ data: string }>(tab.id, 'Page.captureScreenshot', {
            format: 'jpeg',
            quality: 70,
            optimizeForSpeed: true,
          })
          allMessages.push({
            role: 'user',
            content: [
              { type: 'image', mediaType: 'image/jpeg', data },
              { type: 'text', text: 'Here is the current page screenshot after the actions above.' },
            ],
          })
          console.log(`${TAG} 📸 Fresh screenshot captured (${(data.length / 1024).toFixed(0)}KB)`)
        }
      } catch { /* screenshot optional */ }
    }

    console.groupEnd() // turn
  }

  // Safety limit reached — store what we have and send final message
  console.log(`${TAG} ⚠ Safety limit (${MAX_TURNS} turns) reached`)
  console.groupEnd() // agent
  if (userInstruction && recordedSteps.length > 0) {
    const autoSkill = createAutoSkill(userInstruction, recordedSteps, startUrl, configSig)
    await skillStore.saveAutoSkill(autoSkill)
  }
  if (recordedSteps.length > 0 && userInstruction && callbacks.onRecordedSteps) {
    callbacks.onRecordedSteps(recordedSteps, userInstruction, startUrl)
  }
  callbacks.onAssistantMessage('I\'ve completed the actions I could perform. Let me know if you need anything else.', [])
}

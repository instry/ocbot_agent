import type { LlmProvider } from '../llm/types'
import type { ActCache, ActionStep, AlternativeSelector } from './cache'
import { buildRoleName, fuzzyMatchByRoleName } from './cache'
import { capturePageSnapshot, type PageSnapshot } from './snapshot'
import { inferActions } from './inference'
import { ensureAttached, sendCdp } from './cdp'
import { diffTrees } from './diff'
import { logDebug } from '@/lib/debug/eventLog'

export interface ActOptions {
  /** When true, verify click actions had an effect via diffTrees */
  skillReplay?: boolean
}

export interface ActResult {
  success: boolean
  actions: ActionStep[]
  description: string
  cacheHit: boolean
  selfHealed: boolean
  /** Set when a click action had no observable effect (only during skillReplay) */
  noEffect?: boolean
}

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab found')
  return tab.id
}

async function getActiveTabUrl(): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab?.url || ''
}

async function resolveNode(
  tabId: number,
  backendNodeId: number,
): Promise<string> {
  const { object } = await sendCdp<{ object: { objectId: string } }>(
    tabId,
    'DOM.resolveNode',
    { backendNodeId },
  )
  return object.objectId
}

/**
 * Compute an absolute XPath for a DOM node identified by backendNodeId.
 * Returns null on any failure (node gone, detached, etc.).
 */
async function resolveXPath(
  tabId: number,
  backendNodeId: number,
): Promise<string | null> {
  try {
    const objectId = await resolveNode(tabId, backendNodeId)
    const { result } = await sendCdp<{ result: { value: string } }>(
      tabId,
      'Runtime.callFunctionOn',
      {
        objectId,
        functionDeclaration: `function() {
          let el = this;
          const parts = [];
          while (el && el.nodeType === Node.ELEMENT_NODE) {
            let idx = 1;
            let sib = el.previousElementSibling;
            while (sib) {
              if (sib.tagName === el.tagName) idx++;
              sib = sib.previousElementSibling;
            }
            parts.unshift(el.tagName.toLowerCase() + '[' + idx + ']');
            el = el.parentElement;
          }
          return '/' + parts.join('/');
        }`,
        returnByValue: true,
      },
    )
    await sendCdp(tabId, 'Runtime.releaseObject', { objectId })
    return result.value || null
  } catch {
    return null
  }
}

/**
 * Find a DOM element by XPath and return its backendNodeId.
 * Returns null if the XPath doesn't match any element.
 */
export async function findByXPath(
  tabId: number,
  xpath: string,
): Promise<number | null> {
  try {
    const { result } = await sendCdp<{ result: { objectId?: string } }>(
      tabId,
      'Runtime.evaluate',
      {
        expression: `document.evaluate(${JSON.stringify(xpath)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue`,
        returnByValue: false,
      },
    )
    if (!result.objectId) return null
    const { node } = await sendCdp<{ node: { backendNodeId: number } }>(
      tabId,
      'DOM.describeNode',
      { objectId: result.objectId },
    )
    await sendCdp(tabId, 'Runtime.releaseObject', { objectId: result.objectId })
    return node.backendNodeId
  } catch {
    return null
  }
}

/**
 * Enrich actions with XPath and DOM attributes for stable cross-session selectors.
 */
async function enrichWithXPath(
  tabId: number,
  actions: ActionStep[],
  snapshot?: PageSnapshot,
): Promise<ActionStep[]> {
  const enriched: ActionStep[] = []
  for (const action of actions) {
    const xpath = await resolveXPath(tabId, action.backendNodeId)
    let className = action.className
    let testId = action.testId

    // If snapshot available, copy DOM attributes from matching element
    if (snapshot) {
      const el = snapshot.elements.find((e) => e.backendNodeId === action.backendNodeId)
      if (el) {
        if (el.className) className = el.className
        if (el.testId) testId = el.testId
      }
    }

    enriched.push({ ...action, xpath: xpath ?? undefined, className, testId })
  }
  return enriched
}

async function scrollIntoView(tabId: number, objectId: string): Promise<void> {
  try {
    await sendCdp(tabId, 'DOM.scrollIntoViewIfNeeded', { objectId })
  } catch {
    // Best effort — some nodes may not support scrolling
  }
}

async function getClickPoint(
  tabId: number,
  backendNodeId: number,
): Promise<{ x: number; y: number }> {
  const { model } = await sendCdp<{
    model: { content: number[] }
  }>(tabId, 'DOM.getBoxModel', { backendNodeId })

  // content quad: [x1,y1, x2,y2, x3,y3, x4,y4]
  const q = model.content
  const x = (q[0] + q[2] + q[4] + q[6]) / 4
  const y = (q[1] + q[3] + q[5] + q[7]) / 4
  return { x, y }
}

async function cdpClick(tabId: number, backendNodeId: number): Promise<void> {
  const objectId = await resolveNode(tabId, backendNodeId)
  await scrollIntoView(tabId, objectId)
  const { x, y } = await getClickPoint(tabId, backendNodeId)

  await sendCdp(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved', x, y,
  })
  await sendCdp(tabId, 'Input.dispatchMouseEvent', {
    type: 'mousePressed', x, y, button: 'left', clickCount: 1,
  })
  await sendCdp(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased', x, y, button: 'left', clickCount: 1,
  })

  await sendCdp(tabId, 'Runtime.releaseObject', { objectId })
}

async function cdpType(
  tabId: number,
  backendNodeId: number,
  text: string,
): Promise<void> {
  const objectId = await resolveNode(tabId, backendNodeId)
  await scrollIntoView(tabId, objectId)

  // Focus the element
  await sendCdp(tabId, 'Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: 'function() { this.focus(); }',
  })

  // Clear existing value
  await sendCdp(tabId, 'Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: 'function() { this.value = ""; }',
  })

  // Insert text via CDP
  await sendCdp(tabId, 'Input.insertText', { text })

  // Dispatch input/change events
  await sendCdp(tabId, 'Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `function() {
      this.dispatchEvent(new Event('input', { bubbles: true }));
      this.dispatchEvent(new Event('change', { bubbles: true }));
    }`,
  })

  await sendCdp(tabId, 'Runtime.releaseObject', { objectId })
}

async function cdpSelect(
  tabId: number,
  backendNodeId: number,
  value: string,
): Promise<void> {
  const objectId = await resolveNode(tabId, backendNodeId)
  await scrollIntoView(tabId, objectId)

  await sendCdp(tabId, 'Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `function(val) {
      this.value = val;
      this.dispatchEvent(new Event('change', { bubbles: true }));
    }`,
    arguments: [{ value }],
  })

  await sendCdp(tabId, 'Runtime.releaseObject', { objectId })
}

async function cdpPress(tabId: number, key: string): Promise<void> {
  await sendCdp(tabId, 'Input.dispatchKeyEvent', {
    type: 'keyDown', key,
  })
  await sendCdp(tabId, 'Input.dispatchKeyEvent', {
    type: 'keyUp', key,
  })
}

async function executeAction(
  tabId: number,
  action: ActionStep,
): Promise<{ success: boolean; error?: string }> {
  try {
    switch (action.method) {
      case 'click':
        await cdpClick(tabId, action.backendNodeId)
        return { success: true }
      case 'type':
        await cdpType(tabId, action.backendNodeId, action.args?.[0] || '')
        return { success: true }
      case 'select':
        await cdpSelect(tabId, action.backendNodeId, action.args?.[0] || '')
        return { success: true }
      case 'press':
        await cdpPress(tabId, action.args?.[0] || 'Enter')
        return { success: true }
      default:
        return { success: false, error: `Unknown method: ${action.method}` }
    }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function replayActions(
  tabId: number,
  actions: ActionStep[],
  verifyClicks?: boolean,
): Promise<{ success: boolean; failedIndex: number; noEffect?: boolean }> {
  for (let i = 0; i < actions.length; i++) {
    // Capture snapshot before click if verification is enabled
    let beforeSnapshot: PageSnapshot | undefined
    if (verifyClicks && actions[i].method === 'click') {
      try {
        beforeSnapshot = await capturePageSnapshot(tabId)
      } catch {
        // Best effort
      }
    }

    const result = await executeAction(tabId, actions[i])
    if (!result.success) {
      return { success: false, failedIndex: i }
    }

    // Verify click had an effect
    if (beforeSnapshot && actions[i].method === 'click') {
      try {
        // Small delay to let DOM settle
        await new Promise((r) => setTimeout(r, 200))
        const afterSnapshot = await capturePageSnapshot(tabId)
        const diff = diffTrees(beforeSnapshot, afterSnapshot)
        if (!diff.changed && !diff.urlChanged) {
          logDebug('diff', 'Click effect', { changed: false })
          return { success: false, failedIndex: i, noEffect: true }
        }
        logDebug('diff', 'Click effect', { changed: true })
      } catch {
        // Best effort — don't fail on diff errors
      }
    }
  }
  return { success: true, failedIndex: -1 }
}

/**
 * Try to self-heal cached actions by:
 * 1. XPath lookup (stable across page loads)
 * 2. testId matching (most stable DOM selector)
 * 3. Fuzzy roleName matching in current AXTree
 * 4. Alternative selectors (historically successful selectors)
 * Returns updated actions with new backendNodeIds, or null if matching fails.
 */
async function selfHealFromSnapshot(
  tabId: number,
  cachedActions: ActionStep[],
  snapshot: PageSnapshot,
): Promise<ActionStep[] | null> {
  const healed: ActionStep[] = []
  for (const action of cachedActions) {
    // Try xpath first (most stable)
    if (action.xpath) {
      const nodeId = await findByXPath(tabId, action.xpath)
      if (nodeId) {
        logDebug('selector', 'XPath match', { hit: true, xpath: action.xpath })
        healed.push({ ...action, backendNodeId: nodeId })
        continue
      }
      logDebug('selector', 'XPath match', { hit: false, xpath: action.xpath })
    }

    // Try testId match (very stable)
    if (action.testId) {
      const match = snapshot.elements.find(
        (el) => el.testId === action.testId && el.interactable,
      )
      if (match) {
        logDebug('selector', 'testId match', { testId: action.testId })
        healed.push({ ...action, backendNodeId: match.backendNodeId })
        continue
      }
    }

    // Fallback to roleName fuzzy match
    const match = fuzzyMatchByRoleName(action.roleName, snapshot.elements)
    if (match) {
      healed.push({
        ...action,
        backendNodeId: match.backendNodeId,
      })
      continue
    }

    // Try alternative selectors (LRU, cap at 5)
    if (action.alternativeSelectors && action.alternativeSelectors.length > 0) {
      logDebug('selector', 'Trying alternatives', { count: action.alternativeSelectors.length })
      const alts = [...action.alternativeSelectors]
        .sort((a, b) => b.lastSuccessAt - a.lastSuccessAt)
        .slice(0, 5)

      let found = false
      for (const alt of alts) {
        // Try xpath
        if (alt.xpath) {
          const nodeId = await findByXPath(tabId, alt.xpath)
          if (nodeId) {
            healed.push({ ...action, backendNodeId: nodeId })
            found = true
            break
          }
        }
        // Try roleName
        const altMatch = fuzzyMatchByRoleName(alt.roleName, snapshot.elements)
        if (altMatch) {
          healed.push({ ...action, backendNodeId: altMatch.backendNodeId })
          found = true
          break
        }
      }
      if (found) continue
    }

    return null
  }
  return healed
}

/**
 * After a successful self-heal, record the original (now-outdated) selector as an alternative.
 * This handles pages that alternate between layouts.
 */
function recordAlternativeSelector(
  originalAction: ActionStep,
  healedAction: ActionStep,
): ActionStep {
  // If the selector didn't change, no need to record
  if (originalAction.xpath === healedAction.xpath && originalAction.roleName === healedAction.roleName) {
    return healedAction
  }

  const alt: AlternativeSelector = {
    xpath: originalAction.xpath || '',
    roleName: originalAction.roleName,
    lastSuccessAt: Date.now(),
  }

  const existing = healedAction.alternativeSelectors || []
  // Avoid duplicates
  const isDuplicate = existing.some(
    (a) => a.xpath === alt.xpath && a.roleName === alt.roleName,
  )
  if (isDuplicate) return healedAction

  // Cap at 5 alternatives (LRU)
  const updated = [alt, ...existing].slice(0, 5)
  return { ...healedAction, alternativeSelectors: updated }
}

/**
 * Direct node execution — bypasses LLM inference entirely.
 * Used when the agent already knows the nodeId from ariaTree.
 */
export async function actDirect(
  nodeId: number,
  method: string,
  value?: string,
  cache?: ActCache,
  signal?: AbortSignal,
  options?: ActOptions,
): Promise<ActResult> {
  const tabId = await getActiveTabId()
  await ensureAttached(tabId)

  const action: ActionStep = {
    method: method as ActionStep['method'],
    backendNodeId: nodeId,
    roleName: '',
    args: value ? [value] : undefined,
    description: `${method} on node ${nodeId}`,
  }

  const result = await executeAction(tabId, action)
  return {
    success: result.success,
    actions: [action],
    description: action.description,
    cacheHit: false,
    selfHealed: false,
  }
}

export async function act(
  instruction: string,
  provider: LlmProvider,
  cache: ActCache,
  signal?: AbortSignal,
  options?: ActOptions,
): Promise<ActResult> {
  const tabId = await getActiveTabId()
  const url = await getActiveTabUrl()
  await ensureAttached(tabId)
  const verifyClicks = options?.skillReplay ?? false

  // 1. Check cache
  const cached = await cache.lookup(instruction, url)
  if (cached) {
    console.log('[ocbot:act] cache hit, attempting self-heal...')
    // Try self-heal via xpath + roleName match first (no LLM needed)
    const snapshot = await capturePageSnapshot(tabId)
    const healed = await selfHealFromSnapshot(tabId, cached.actions, snapshot)

    if (healed) {
      const replay = await replayActions(tabId, healed, verifyClicks)
      if (replay.success) {
        console.log('[ocbot:act] ✅ self-heal success')
        // Record alternative selectors for healed actions
        const withAlts = healed.map((h, idx) => recordAlternativeSelector(cached.actions[idx], h))
        const enriched = await enrichWithXPath(tabId, withAlts, snapshot)
        await cache.update(instruction, url, enriched)
        return {
          success: true,
          actions: enriched,
          description: cached.description,
          cacheHit: true,
          selfHealed: healed !== cached.actions,
        }
      }
    }

    // Self-heal failed — fall through to full LLM re-inference
    logDebug('L1', 'Self-heal result', { success: false })
    console.log('[ocbot:act] ❌ self-heal failed, re-inferring with LLM...')
    if (signal?.aborted) throw new Error('Aborted')

    const freshSnapshot = healed ? await capturePageSnapshot(tabId) : snapshot
    const inferred = await inferActions(instruction, freshSnapshot, provider, signal, tabId)
    const healReplay = await replayActions(tabId, inferred.actions, verifyClicks)

    if (healReplay.success) {
      const enriched = await enrichWithXPath(tabId, inferred.actions, freshSnapshot)
      await cache.update(instruction, url, enriched)
    }

    return {
      success: healReplay.success,
      actions: inferred.actions,
      description: inferred.description,
      cacheHit: false,
      selfHealed: true,
    }
  }

  // 2. Cache miss: snapshot → infer → execute → store (with xpath)
  console.log('[ocbot:act] cache miss, inferring with LLM...')
  const snapshot = await capturePageSnapshot(tabId)
  if (signal?.aborted) throw new Error('Aborted')

  const inferred = await inferActions(instruction, snapshot, provider, signal, tabId)
  console.log('[ocbot:act] inferred actions:', inferred.actions.map(a => `${a.method}(${a.roleName})`).join(', '))
  const result = await replayActions(tabId, inferred.actions, verifyClicks)
  console.log(`[ocbot:act] replay result: ${result.success ? '✅' : '❌'}`)

  if (result.success) {
    const enriched = await enrichWithXPath(tabId, inferred.actions, snapshot)
    await cache.store(instruction, url, enriched, inferred.description)
  }

  return {
    success: result.success,
    actions: inferred.actions,
    description: inferred.description,
    cacheHit: false,
    selfHealed: false,
  }
}

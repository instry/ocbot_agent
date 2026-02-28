import { useState, useCallback, useRef, useEffect } from 'react'
import type { ChatMessage, Conversation } from '@/lib/types'
import type { LlmProvider, LlmRequestMessage } from '@/lib/llm/types'
import { runAgentLoop } from '@/lib/agent/loop'
import { ActCache } from '@/lib/agent/cache'
import { AgentCache } from '@/lib/agent/agentCache'
import { saveConversation, getConversations, deleteConversation } from '@/lib/storage'

export interface ToolStatus {
  id: string
  name: string
  status: 'running' | 'done'
  result?: string
}

const actCache = new ActCache()
const agentCacheInstance = new AgentCache()

function generateTitle(messages: ChatMessage[]): string {
  const firstUserMsg = messages.find(m => m.role === 'user')
  if (!firstUserMsg) return 'New Chat'
  const text = firstUserMsg.content.trim()
  return text.length > 30 ? text.slice(0, 30) + '…' : text
}

export function useChat(provider: LlmProvider | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState(() => `conv_${Date.now()}`)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [toolStatuses, setToolStatuses] = useState<ToolStatus[]>([])
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // Track the current conversation's title for saving
  const convMetaRef = useRef<{ title?: string }>({})

  const refreshConversations = useCallback(async () => {
    const convs = await getConversations()
    setConversations(convs)
    return convs
  }, [])

  useEffect(() => {
    getConversations().then(convs => {
      setConversations(convs)
    })
  }, [])

  // Auto-save conversation when messages change
  useEffect(() => {
    if (messages.length === 0) return
    const title = convMetaRef.current.title || generateTitle(messages)
    const conv: Conversation = {
      id: conversationId,
      messages,
      createdAt: messages[0].createdAt,
      updatedAt: Date.now(),
      title,
    }
    saveConversation(conv).then(() => refreshConversations())
  }, [messages, conversationId, refreshConversations])

  const loadConversation = useCallback(async (id: string) => {
    let conv = conversations.find(c => c.id === id)
    if (!conv) {
      // conversations state may not be populated yet (race on mount)
      const all = await getConversations()
      conv = all.find(c => c.id === id)
      if (!conv) return
      setConversations(all)
    }
    setConversationId(conv.id)
    setMessages(conv.messages)
    convMetaRef.current = { title: conv.title }
    setStreamingText('')
    setToolStatuses([])
    setError(null)
  }, [conversations])

  const removeConversation = useCallback(async (id: string) => {
    await deleteConversation(id)
    const convs = await refreshConversations()
    if (id === conversationId) {
      // Switch to next conversation or start fresh
      if (convs.length > 0) {
        const next = convs[0]
        setConversationId(next.id)
        setMessages(next.messages)
        convMetaRef.current = { title: next.title }
      } else {
        setMessages([])
        setConversationId(`conv_${Date.now()}`)
        convMetaRef.current = {}
      }
      setStreamingText('')
      setToolStatuses([])
      setError(null)
    }
  }, [conversationId, refreshConversations])

  const sendMessage = useCallback(async (text: string) => {
    if (!provider || !text.trim() || isLoading) return

    setError(null)
    setIsLoading(true)
    setStreamingText('')
    setToolStatuses([])

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: text.trim(),
      createdAt: Date.now(),
    }

    setMessages(prev => [...prev, userMsg])

    // Build LLM messages from chat history
    const allMessages = [...messages, userMsg]
    const llmMessages: LlmRequestMessage[] = allMessages.map(m => {
      if (m.role === 'tool' && m.toolResult) {
        return {
          role: 'tool' as const,
          content: m.toolResult.result,
          toolCallId: m.toolResult.toolCallId,
        }
      }
      if (m.role === 'assistant' && m.toolCalls?.length) {
        return {
          role: 'assistant' as const,
          content: m.content || undefined,
          toolCalls: m.toolCalls,
        }
      }
      return {
        role: m.role === 'tool' ? 'tool' as const : m.role as 'user' | 'assistant',
        content: m.content,
      }
    })

    const abortController = new AbortController()
    abortRef.current = abortController

    let currentText = ''

    try {
      await runAgentLoop(
        provider,
        llmMessages,
        {
          onTextDelta: (text) => {
            currentText += text
            setStreamingText(currentText)
          },
          onToolCallStart: (id, name) => {
            setToolStatuses(prev => [...prev, { id, name, status: 'running' }])
          },
          onToolCallEnd: (id, name, result) => {
            setToolStatuses(prev =>
              prev.map(ts => ts.id === id ? { ...ts, status: 'done' as const, result } : ts)
            )
          },
          onAssistantMessage: (content, toolCalls) => {
            if (content || toolCalls.length > 0) {
              const assistantMsg: ChatMessage = {
                id: `msg_${Date.now()}_assistant`,
                role: 'assistant',
                content: content || '',
                createdAt: Date.now(),
                toolCalls: toolCalls.length > 0 ? toolCalls.map(tc => ({
                  id: tc.id,
                  name: tc.name,
                  arguments: tc.arguments,
                })) : undefined,
              }
              setMessages(prev => [...prev, assistantMsg])
              currentText = ''
              setStreamingText('')
            }
          },
          onToolMessage: (toolCallId, name, result) => {
            const safeResult = (result ?? '').slice(0, 500)
            const toolMsg: ChatMessage = {
              id: `msg_${Date.now()}_tool_${toolCallId}`,
              role: 'tool',
              content: safeResult,
              createdAt: Date.now(),
              toolResult: { toolCallId, name, result: safeResult },
            }
            setMessages(prev => [...prev, toolMsg])
          },
          onError: (error) => {
            setError(error)
          },
        },
        abortController.signal,
        actCache,
        undefined, // variables
        agentCacheInstance,
      )
    } catch (err: unknown) {
      if (abortController.signal.aborted) return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
      setStreamingText('')
      abortRef.current = null
    }
  }, [provider, messages, isLoading])

  const stopAgent = useCallback(() => {
    abortRef.current?.abort()
    setIsLoading(false)
    setStreamingText('')
  }, [])

  const newChat = useCallback(() => {
    setMessages([])
    setConversationId(`conv_${Date.now()}`)
    convMetaRef.current = {}
    setStreamingText('')
    setToolStatuses([])
    setError(null)
  }, [])

  return {
    messages,
    conversationId,
    conversations,
    streamingText,
    isLoading,
    toolStatuses,
    error,
    sendMessage,
    stopAgent,
    newChat,
    loadConversation,
    removeConversation,
  }
}

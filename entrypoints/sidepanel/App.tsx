import { useState, useEffect, useCallback, useRef } from 'react'
import { ChatArea } from '@/components/ChatArea'
import { ChatInput } from '@/components/ChatInput'
import { ChatList } from '@/components/ChatList'
import { Header } from './components/Header'
import { Settings } from '@/components/Settings'
import { useLlmProvider } from '@/lib/llm/useLlmProvider'
import { useChat } from '@/lib/hooks/useChat'
import type { ChannelStatus } from '@/lib/channels/types'

type View = 'chat' | 'chatList' | 'settings'

export function App() {
  const [view, setView] = useState<View>('chat')
  const { providers, selectedProvider, saveProvider, deleteProvider, selectProvider } = useLlmProvider()
  const {
    messages, conversationId, conversations, streamingText, isLoading,
    toolStatuses, error, sendMessage, stopAgent, newChat,
    loadConversation, removeConversation,
  } = useChat(selectedProvider)
  const [channelStatuses, setChannelStatuses] = useState<Record<string, ChannelStatus>>({})
  const pendingMessageRef = useRef<string | null>(null)

  // Process pending message once provider is ready
  useEffect(() => {
    if (pendingMessageRef.current && selectedProvider && !isLoading) {
      const text = pendingMessageRef.current
      pendingMessageRef.current = null
      sendMessage(text)
    }
  }, [selectedProvider, isLoading, sendMessage])

  // Pick up pending message from home page (on mount)
  useEffect(() => {
    chrome.storage.local.get(['ocbot_pending_message', 'ocbot_load_conversation']).then(result => {
      const text = result.ocbot_pending_message
      if (text && typeof text === 'string') {
        chrome.storage.local.remove('ocbot_pending_message')
        newChat()
        pendingMessageRef.current = text
        return
      }
      const convId = result.ocbot_load_conversation
      if (convId && typeof convId === 'string') {
        chrome.storage.local.remove('ocbot_load_conversation')
        loadConversation(convId)
        setView('chat')
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Pick up pending message or load conversation when side panel is already open
  useEffect(() => {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.ocbot_pending_message?.newValue) {
        const text = changes.ocbot_pending_message.newValue
        chrome.storage.local.remove('ocbot_pending_message')
        newChat()
        pendingMessageRef.current = text
      }
      if (changes.ocbot_load_conversation?.newValue) {
        const convId = changes.ocbot_load_conversation.newValue
        chrome.storage.local.remove('ocbot_load_conversation')
        loadConversation(convId)
        setView('chat')
      }
    }
    chrome.storage.local.onChanged.addListener(listener)
    return () => chrome.storage.local.onChanged.removeListener(listener)
  }, [newChat, loadConversation])

  const refreshChannelStatuses = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'getChannelStatuses' }, (resp) => {
      if (resp?.ok) {
        setChannelStatuses(resp.statuses)
      }
    })
  }, [])

  // Poll statuses on mount and listen for updates
  useEffect(() => {
    refreshChannelStatuses()
    const interval = setInterval(refreshChannelStatuses, 5000)

    const listener = (message: { type: string; channelId: string; status: ChannelStatus }) => {
      if (message.type === 'channelStatusUpdate') {
        setChannelStatuses(prev => ({ ...prev, [message.channelId]: message.status }))
      }
    }
    chrome.runtime.onMessage.addListener(listener)

    return () => {
      clearInterval(interval)
      chrome.runtime.onMessage.removeListener(listener)
    }
  }, [refreshChannelStatuses])

  const handleSelectChat = useCallback((id: string) => {
    loadConversation(id)
    setView('chat')
  }, [loadConversation])

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      {view !== 'settings' && (
        <Header
          view={view === 'chatList' ? 'history' : 'chat'}
          onOpenSettings={() => setView('settings')}
          onNewChat={() => { newChat(); setView('chat') }}
          onToggleHistory={() => setView(v => v === 'chatList' ? 'chat' : 'chatList')}
          channelStatuses={channelStatuses}
        />
      )}
      {view === 'chat' && (
        <>
          <ChatArea
            hasProvider={!!selectedProvider}
            onOpenSettings={() => setView('settings')}
            messages={messages}
            streamingText={streamingText}
            isLoading={isLoading}
            toolStatuses={toolStatuses}
            error={error}
          />
          <ChatInput
            onSend={sendMessage}
            onStop={stopAgent}
            isLoading={isLoading}
            disabled={!selectedProvider}
            providers={providers}
            selectedProvider={selectedProvider}
            onSelectProvider={selectProvider}
            onConfigureLlm={() => setView('settings')}
          />
        </>
      )}
      {view === 'chatList' && (
        <ChatList
          conversations={conversations}
          activeConversationId={conversationId}
          onSelectChat={handleSelectChat}
          onDeleteChat={removeConversation}
        />
      )}
      {view === 'settings' && (
        <Settings
          providers={providers}
          selectedProvider={selectedProvider}
          onSaveProvider={saveProvider}
          onDeleteProvider={deleteProvider}
          onSelectProvider={selectProvider}
          onBack={() => setView('chat')}
        />
      )}
    </div>
  )
}

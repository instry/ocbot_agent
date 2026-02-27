import { useState, useEffect, useCallback } from 'react'
import { ChatArea } from './components/ChatArea'
import { ChatInput } from './components/ChatInput'
import { ChatList } from './components/ChatList'
import { Header } from './components/Header'
import { Settings } from './components/Settings'
import { useLlmProvider } from '../../lib/llm/useLlmProvider'
import { useChat } from './hooks/useChat'
import type { ChannelStatus } from '../../lib/channels/types'

type View = 'chat' | 'chatList' | 'settings'

export function App() {
  const [view, setView] = useState<View>('chat')
  const { providers, selectedProvider, saveProvider, deleteProvider, selectProvider } = useLlmProvider()
  const {
    messages, conversationId, conversations, streamingText, isLoading,
    toolStatuses, error, sendMessage, stopAgent, newChat,
    loadConversation, updateConversation, removeConversation,
  } = useChat(selectedProvider)
  const [channelStatuses, setChannelStatuses] = useState<Record<string, ChannelStatus>>({})

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
      {view === 'chat' ? (
        <>
          <Header
            selectedProvider={selectedProvider}
            providers={providers}
            onSelectProvider={selectProvider}
            onOpenSettings={() => setView('settings')}
            onNewChat={newChat}
            onOpenChatList={() => setView('chatList')}
            channelStatuses={channelStatuses}
          />
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
          />
        </>
      ) : view === 'chatList' ? (
        <ChatList
          conversations={conversations}
          activeConversationId={conversationId}
          onSelectChat={handleSelectChat}
          onPinChat={(id, pinned) => updateConversation(id, { pinned })}
          onRenameChat={(id, title) => updateConversation(id, { title })}
          onDeleteChat={removeConversation}
          onClose={() => setView('chat')}
        />
      ) : (
        <Settings
          providers={providers}
          selectedProvider={selectedProvider}
          onSaveProvider={saveProvider}
          onDeleteProvider={deleteProvider}
          onSelectProvider={selectProvider}
          onBack={() => setView('chat')}
          channelStatuses={channelStatuses}
          onRefreshChannelStatuses={refreshChannelStatuses}
        />
      )}
    </div>
  )
}

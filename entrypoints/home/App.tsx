import { useState, useEffect, useCallback, useRef } from 'react'
import { WelcomeHero } from '@/components/WelcomeHero'
import { ChatInput } from '@/components/ChatInput'
import type { ChatInputHandle } from '@/components/ChatInput'
import { Settings } from '@/components/Settings'
import { ChannelSettings } from '@/components/ChannelSettings'
import { Sidebar } from './components/Sidebar'
import { SkillsPage } from './pages/SkillsPage'
import { useLlmProvider } from '@/lib/llm/useLlmProvider'
import type { LlmProvider } from '@/lib/llm/types'
import type { ChannelStatus } from '@/lib/channels/types'

type Page = 'new-session' | 'skills' | 'remote' | 'settings'

const SUGGESTION_CHIPS = [
  'Search for flights',
  'Monitor prices',
  'Find leads',
  'Scrape job listings',
]

function NewSessionPage({
  onNavigate,
  providers,
  selectedProvider,
  selectProvider,
}: {
  onNavigate: (page: Page) => void
  providers: LlmProvider[]
  selectedProvider: LlmProvider | null
  selectProvider: (id: string) => Promise<void>
}) {
  const chatInputRef = useRef<ChatInputHandle>(null)

  const handleSend = useCallback(async (text: string) => {
    await chrome.storage.local.set({ ocbot_pending_message: text })
    const { id: windowId } = await chrome.windows.getCurrent()
    await chrome.sidePanel.open({ windowId: windowId! })
  }, [])

  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex w-full max-w-2xl flex-col items-center gap-6 px-6">
        <WelcomeHero size="lg" />
        <ChatInput
          ref={chatInputRef}
          onSend={handleSend}
          variant="standalone"
          rows={4}
          minHeight="min-h-[100px]"
          providers={providers}
          selectedProvider={selectedProvider}
          onSelectProvider={selectProvider}
          onConfigureLlm={() => onNavigate('settings')}
        />
        <div className="flex flex-wrap justify-center gap-2">
          {SUGGESTION_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => chatInputRef.current?.setInput(chip)}
              className="cursor-pointer rounded-full border border-border/60 px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function App() {
  const [page, setPage] = useState<Page>(() => {
    const hash = window.location.hash.replace('#/', '')
    if (hash === 'skills' || hash === 'remote' || hash === 'settings') return hash
    return 'new-session'
  })
  const { providers, selectedProvider, saveProvider, deleteProvider, selectProvider } = useLlmProvider()
  const [channelStatuses, setChannelStatuses] = useState<Record<string, ChannelStatus>>({})

  const refreshChannelStatuses = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'getChannelStatuses' }, (resp) => {
      if (resp?.ok) {
        setChannelStatuses(resp.statuses)
      }
    })
  }, [])

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

  return (
    <div className="flex h-screen w-screen bg-background text-foreground">
      <Sidebar
        activePage={page}
        onNavigate={setPage}
        onSelectConversation={async (id) => {
          await chrome.storage.local.set({ ocbot_load_conversation: id })
          const { id: windowId } = await chrome.windows.getCurrent()
          await chrome.sidePanel.open({ windowId: windowId! })
        }}
      />
      <main className="flex-1 overflow-hidden">
        {page === 'new-session' && (
          <NewSessionPage
            onNavigate={setPage}
            providers={providers}
            selectedProvider={selectedProvider}
            selectProvider={selectProvider}
          />
        )}
        {page === 'skills' && <SkillsPage />}
        {page === 'remote' && (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
              <h2 className="text-sm font-semibold">Remote Channels</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <ChannelSettings
                channelStatuses={channelStatuses}
                onRefreshStatuses={refreshChannelStatuses}
              />
            </div>
          </div>
        )}
        {page === 'settings' && (
          <Settings
            providers={providers}
            selectedProvider={selectedProvider}
            onSaveProvider={saveProvider}
            onDeleteProvider={deleteProvider}
            onSelectProvider={selectProvider}
            onBack={() => setPage('new-session')}
          />
        )}
      </main>
    </div>
  )
}

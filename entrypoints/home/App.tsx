import { useState, useCallback, useRef, useEffect } from 'react'
import { Send, Settings as SettingsIcon, ChevronDown } from 'lucide-react'
import { BotAvatar } from '@/components/BotAvatar'
import { Sidebar } from './components/Sidebar'
import { SkillsPage } from './pages/SkillsPage'
import { useLlmProvider } from '@/lib/llm/useLlmProvider'
import { getModelDisplayName } from '@/lib/llm/models'

type Page = 'new-session' | 'skills' | 'settings'

const SUGGESTION_CHIPS = [
  'Search for flights',
  'Monitor prices',
  'Find leads',
  'Scrape job listings',
]

function NewSessionPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [input, setInput] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { providers, selectedProvider, selectProvider } = useLlmProvider()

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [dropdownOpen])

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim()) return
    await chrome.storage.local.set({ ocbot_pending_message: input.trim() })
    // Must call open() directly from extension page to retain user gesture context
    const { id: windowId } = await chrome.windows.getCurrent()
    await chrome.sidePanel.open({ windowId: windowId! })
    setInput('')
  }, [input])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex w-full max-w-2xl flex-col items-center gap-6 px-6">
        <div className="flex flex-col items-center gap-3">
          <div className="ring-4 ring-primary/10 rounded-full">
            <BotAvatar size="lg" />
          </div>
          <h1 className="text-3xl font-semibold text-foreground">
            How can I help?
          </h1>
        </div>
        <form onSubmit={handleSubmit} className="w-full">
          <div className="rounded-2xl border border-border/50 bg-muted/50 shadow-sm transition-colors hover:border-border focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <textarea
              className="max-h-48 min-h-[100px] w-full resize-none rounded-t-2xl bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/70"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me to complete a task..."
              rows={4}
            />
            <div className="flex items-center justify-between px-3 pb-2">
              <div />
              <div className="flex items-center gap-2">
                <div ref={dropdownRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {selectedProvider ? getModelDisplayName(selectedProvider) : 'Select model'}
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {dropdownOpen && (
                    <div className="absolute right-0 bottom-full mb-1 min-w-[180px] rounded-lg border border-border bg-popover p-1 shadow-lg">
                      {providers.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => { setDropdownOpen(false); onNavigate('settings') }}
                          className="w-full cursor-pointer rounded-md px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          Configure LLM...
                        </button>
                      ) : (
                        providers.map((p) => (
                          <button
                            type="button"
                            key={p.id}
                            onClick={() => { selectProvider(p.id); setDropdownOpen(false) }}
                            className={`w-full cursor-pointer rounded-md px-3 py-2 text-left text-xs transition-colors hover:bg-muted ${
                              selectedProvider?.id === p.id ? 'text-primary font-medium' : 'text-foreground'
                            }`}
                          >
                            {getModelDisplayName(p)}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="cursor-pointer rounded-full bg-primary p-2 text-primary-foreground shadow-sm transition-all hover:scale-105 hover:bg-primary/80 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </form>
        <div className="flex flex-wrap justify-center gap-2">
          {SUGGESTION_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => setInput(chip)}
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
    if (hash === 'skills' || hash === 'settings') return hash
    return 'new-session'
  })

  return (
    <div className="flex h-screen w-screen bg-background text-foreground">
      <Sidebar activePage={page} onNavigate={setPage} />
      <main className="flex-1 overflow-hidden">
        {page === 'new-session' && <NewSessionPage onNavigate={setPage} />}
        {page === 'skills' && <SkillsPage />}
        {page === 'settings' && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <SettingsIcon className="h-10 w-10 text-muted-foreground/40" />
            <h2 className="text-lg font-medium text-foreground">Settings</h2>
            <p className="text-sm">Coming soon — configuration and preferences</p>
          </div>
        )}
      </main>
    </div>
  )
}

import { useState, useCallback } from 'react'
import { Send } from 'lucide-react'
import { BotAvatar } from '@/components/BotAvatar'
import { Sidebar } from './components/Sidebar'

type Page = 'new-session' | 'skills' | 'settings'

function NewSessionPage() {
  const [input, setInput] = useState('')

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim()) return
    // TODO: create session and send message
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
          <h1 className="text-2xl font-semibold text-foreground">
            How can I help?
          </h1>
          <p className="text-sm text-muted-foreground">
            I can browse the web, find information, and complete tasks for you
          </p>
        </div>
        <form onSubmit={handleSubmit} className="relative w-full">
          <textarea
            className="max-h-32 min-h-[52px] w-full resize-none rounded-2xl border border-border/50 bg-muted/50 px-4 py-3 pr-12 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 hover:border-border focus:border-primary"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me to complete a task..."
            rows={1}
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="absolute right-2.5 bottom-2.5 rounded-full bg-primary p-2 text-primary-foreground shadow-sm transition-all hover:bg-primary/80 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>
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
        {page === 'new-session' && <NewSessionPage />}
        {page === 'skills' && (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Skills — coming soon
          </div>
        )}
        {page === 'settings' && (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Settings — coming soon
          </div>
        )}
      </main>
    </div>
  )
}

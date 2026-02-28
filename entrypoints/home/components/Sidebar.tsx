import { useState, useEffect, useCallback } from 'react'
import { SquarePen, Puzzle, Smartphone, Settings, Trash2, Loader2 } from 'lucide-react'
import { BotAvatar } from '@/components/BotAvatar'
import { getConversations, deleteConversation } from '@/lib/storage'
import type { Conversation } from '@/lib/types'

type Page = 'new-session' | 'skills' | 'remote' | 'settings'

interface SidebarProps {
  activePage: Page
  onNavigate: (page: Page) => void
  onSelectConversation: (id: string) => void
}

const PAGE_SIZE = 20

const bottomNavItems: { id: Page; label: string; icon: typeof Puzzle }[] = [
  { id: 'skills', label: 'Skills', icon: Puzzle },
  { id: 'remote', label: 'Remote', icon: Smartphone },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export function Sidebar({ activePage, onNavigate, onSelectConversation }: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE)
  const [loadingMore, setLoadingMore] = useState(false)

  const refresh = useCallback(async () => {
    const convs = await getConversations()
    setConversations(convs)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Listen for conversation changes from other contexts (sidepanel saves)
  useEffect(() => {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.ocbot_conversations) refresh()
    }
    chrome.storage.local.onChanged.addListener(listener)
    return () => chrome.storage.local.onChanged.removeListener(listener)
  }, [refresh])

  const handleDelete = async (id: string) => {
    await deleteConversation(id)
    await refresh()
  }

  const handleLoadMore = () => {
    setLoadingMore(true)
    setTimeout(() => {
      setDisplayCount(prev => prev + PAGE_SIZE)
      setLoadingMore(false)
    }, 0)
  }

  const visible = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, displayCount)
  const hasMore = conversations.length > displayCount

  return (
    <aside className="flex h-full w-56 flex-col border-r border-border/40 bg-muted/30">
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-3">
        <BotAvatar size="sm" />
        <span className="text-base font-semibold text-foreground tracking-tight">ocbot</span>
      </div>

      {/* New Session button */}
      <div className="px-2 pb-2">
        <button
          onClick={() => onNavigate('new-session')}
          className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
            activePage === 'new-session'
              ? 'bg-accent text-accent-foreground font-medium'
              : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
          }`}
        >
          <SquarePen className="h-4 w-4" />
          New Session
        </button>
      </div>

      {/* Conversation history */}
      <div className="flex-1 overflow-y-auto px-2">
        {visible.length > 0 && (
          <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
            History
          </div>
        )}
        {visible.map(conv => (
          <div
            key={conv.id}
            className="group flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-muted/80"
            onClick={() => onSelectConversation(conv.id)}
          >
            <div className="min-w-0 flex-1 truncate text-foreground/80">
              {conv.title || 'New Chat'}
            </div>
            <button
              onClick={e => { e.stopPropagation(); handleDelete(conv.id) }}
              className="shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        {hasMore && (
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Load more'}
          </button>
        )}
      </div>

      {/* Bottom nav */}
      <nav className="space-y-0.5 border-t border-border/40 px-2 py-2">
        {bottomNavItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`relative flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              activePage === id
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>
      <div className="px-4 pb-4 text-[11px] text-muted-foreground/50">
        v0.1.0
      </div>
    </aside>
  )
}

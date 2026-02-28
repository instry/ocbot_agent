import { Trash2 } from 'lucide-react'
import type { Conversation } from '@/lib/types'

interface ChatListProps {
  conversations: Conversation[]
  activeConversationId: string
  onSelectChat: (id: string) => void
  onDeleteChat: (id: string) => void
}

function groupConversations(conversations: Conversation[]) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86400000

  const today: Conversation[] = []
  const yesterday: Conversation[] = []
  const earlier: Conversation[] = []

  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)

  for (const conv of sorted) {
    if (conv.updatedAt >= todayStart) {
      today.push(conv)
    } else if (conv.updatedAt >= yesterdayStart) {
      yesterday.push(conv)
    } else {
      earlier.push(conv)
    }
  }

  return { today, yesterday, earlier }
}

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

function ChatItem({
  conv,
  isActive,
  onSelect,
  onDelete,
}: {
  conv: Conversation
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const title = conv.title || 'New Chat'

  return (
    <div
      className={`group relative flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/80 ${
        isActive ? 'bg-accent/50' : ''
      }`}
      onClick={onSelect}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{title}</div>
        <span className="text-xs text-muted-foreground">{relativeTime(conv.updatedAt)}</span>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-destructive group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function ChatList({
  conversations,
  activeConversationId,
  onSelectChat,
  onDeleteChat,
}: ChatListProps) {
  const { today, yesterday, earlier } = groupConversations(conversations)

  const renderSection = (label: string, items: Conversation[]) => {
    if (items.length === 0) return null
    return (
      <div className="mb-2">
        <div className="px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        {items.map(conv => (
          <ChatItem
            key={conv.id}
            conv={conv}
            isActive={conv.id === activeConversationId}
            onSelect={() => onSelectChat(conv.id)}
            onDelete={() => onDeleteChat(conv.id)}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-1">
      {conversations.length > 0 ? (
        <>
          {renderSection('Today', today)}
          {renderSection('Yesterday', yesterday)}
          {renderSection('Earlier', earlier)}
        </>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          No conversations yet
        </div>
      )}
    </div>
  )
}

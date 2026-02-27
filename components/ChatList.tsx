import { useState, useRef, useEffect } from 'react'
import { MoreHorizontal, Pin, PinOff, Pencil, Trash2, ArrowLeft } from 'lucide-react'
import type { Conversation } from '@/lib/types'

interface ChatListProps {
  conversations: Conversation[]
  activeConversationId: string
  onSelectChat: (id: string) => void
  onPinChat: (id: string, pinned: boolean) => void
  onRenameChat: (id: string, title: string) => void
  onDeleteChat: (id: string) => void
  onClose: () => void
}

function groupConversations(conversations: Conversation[]) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86400000

  const pinned: Conversation[] = []
  const today: Conversation[] = []
  const yesterday: Conversation[] = []
  const earlier: Conversation[] = []

  // Sort by updatedAt descending first
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)

  for (const conv of sorted) {
    if (conv.pinned) {
      pinned.push(conv)
    } else if (conv.updatedAt >= todayStart) {
      today.push(conv)
    } else if (conv.updatedAt >= yesterdayStart) {
      yesterday.push(conv)
    } else {
      earlier.push(conv)
    }
  }

  return { pinned, today, yesterday, earlier }
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
  onPin,
  onRename,
  onDelete,
}: {
  conv: Conversation
  isActive: boolean
  onSelect: () => void
  onPin: () => void
  onRename: (title: string) => void
  onDelete: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isRenaming])

  const title = conv.title || 'New Chat'

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== title) {
      onRename(trimmed)
    }
    setIsRenaming(false)
  }

  return (
    <div
      className={`group relative flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/80 ${
        isActive ? 'bg-accent/50' : ''
      }`}
      onClick={() => !isRenaming && onSelect()}
    >
      <div className="min-w-0 flex-1">
        {isRenaming ? (
          <input
            ref={inputRef}
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={e => {
              if (e.key === 'Enter') handleRenameSubmit()
              if (e.key === 'Escape') setIsRenaming(false)
            }}
            onClick={e => e.stopPropagation()}
            className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              {conv.pinned && <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />}
              <span className="truncate font-medium">{title}</span>
            </div>
            <span className="text-xs text-muted-foreground">{relativeTime(conv.updatedAt)}</span>
          </>
        )}
      </div>

      <div className="relative shrink-0" ref={menuRef}>
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
          className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-lg border border-border bg-popover p-1 shadow-lg">
            <button
              onClick={e => {
                e.stopPropagation()
                onPin()
                setMenuOpen(false)
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent"
            >
              {conv.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              {conv.pinned ? 'Unpin' : 'Pin'}
            </button>
            <button
              onClick={e => {
                e.stopPropagation()
                setRenameValue(title)
                setIsRenaming(true)
                setMenuOpen(false)
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent"
            >
              <Pencil className="h-3.5 w-3.5" />
              Rename
            </button>
            <button
              onClick={e => {
                e.stopPropagation()
                onDelete()
                setMenuOpen(false)
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function ChatList({
  conversations,
  activeConversationId,
  onSelectChat,
  onPinChat,
  onRenameChat,
  onDeleteChat,
  onClose,
}: ChatListProps) {
  const { pinned, today, yesterday, earlier } = groupConversations(conversations)

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
            onSelect={() => { onSelectChat(conv.id); onClose() }}
            onPin={() => onPinChat(conv.id, !conv.pinned)}
            onRename={title => onRenameChat(conv.id, title)}
            onDelete={() => onDeleteChat(conv.id)}
          />
        ))}
      </div>
    )
  }

  const hasConversations = conversations.length > 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium">Chats</span>
      </div>

      <div className="flex-1 overflow-y-auto p-1">
        {hasConversations ? (
          <>
            {renderSection('Pinned', pinned)}
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
    </div>
  )
}

import { Settings, SquarePen, PanelLeft } from 'lucide-react'
import type { ChannelStatus } from '@/lib/channels/types'

interface HeaderProps {
  onOpenSettings: () => void
  onNewChat: () => void
  onOpenChatList: () => void
  channelStatuses: Record<string, ChannelStatus>
}

export function Header({ onOpenSettings, onNewChat, onOpenChatList, channelStatuses }: HeaderProps) {
  // Compute aggregate channel status
  const statusValues = Object.values(channelStatuses)
  const aggregateChannelStatus: ChannelStatus | null =
    statusValues.length === 0 ? null
    : statusValues.includes('error') ? 'error'
    : statusValues.includes('connecting') ? 'connecting'
    : statusValues.includes('connected') ? 'connected'
    : null

  const statusDotColor = aggregateChannelStatus === 'connected' ? 'bg-green-500'
    : aggregateChannelStatus === 'connecting' ? 'bg-yellow-500'
    : aggregateChannelStatus === 'error' ? 'bg-red-500'
    : null

  return (
    <header className="flex items-center justify-between border-b border-border/40 px-3 py-2">
      <span className="text-sm font-semibold">Ocbot</span>

      <div className="flex items-center gap-0.5">
        <button
          onClick={onOpenChatList}
          className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          title="Chat list"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <button
          onClick={onNewChat}
          className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          title="New Chat"
        >
          <SquarePen className="h-4 w-4" />
        </button>
        <button
          onClick={onOpenSettings}
          className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          title="Settings"
        >
          <div className="relative">
            <Settings className="h-4 w-4" />
            {statusDotColor && (
              <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-background ${statusDotColor}`} />
            )}
          </div>
        </button>
      </div>
    </header>
  )
}

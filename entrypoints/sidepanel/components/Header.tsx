import { Settings, Menu, ArrowLeft, SquarePen } from 'lucide-react'
import type { ChannelStatus } from '@/lib/channels/types'
import { BotAvatar } from '@/components/BotAvatar'

interface HeaderProps {
  view: 'chat' | 'history'
  onOpenSettings: () => void
  onNewChat: () => void
  onToggleHistory: () => void
  channelStatuses: Record<string, ChannelStatus>
}

export function Header({ view, onOpenSettings, onNewChat, onToggleHistory, channelStatuses }: HeaderProps) {
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

  if (view === 'history') {
    return (
      <header className="flex items-center justify-between border-b border-border/40 px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleHistory}
            className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
            title="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold">History</span>
        </div>
        <div className="flex items-center gap-0.5">
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

  return (
    <header className="flex items-center justify-between border-b border-border/40 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <BotAvatar size="sm" />
        <span className="text-sm font-semibold">ocbot</span>
      </div>
      <button
        onClick={onToggleHistory}
        className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
        title="History"
      >
        <Menu className="h-4 w-4" />
      </button>
    </header>
  )
}

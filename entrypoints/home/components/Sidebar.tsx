import { SquarePen, Puzzle, Smartphone, Settings } from 'lucide-react'
import { BotAvatar } from '@/components/BotAvatar'

type Page = 'new-session' | 'skills' | 'remote' | 'settings'

interface SidebarProps {
  activePage: Page
  onNavigate: (page: Page) => void
}

const navItems: { id: Page; label: string; icon: typeof SquarePen }[] = [
  { id: 'new-session', label: 'New Session', icon: SquarePen },
  { id: 'skills', label: 'Skills', icon: Puzzle },
  { id: 'remote', label: 'Remote', icon: Smartphone },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <aside className="flex h-full w-56 flex-col border-r border-border/40 bg-muted/30">
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
        <BotAvatar size="sm" />
        <span className="text-base font-semibold text-foreground tracking-tight">ocbot</span>
      </div>
      <nav className="flex-1 space-y-0.5 px-2">
        {navItems.map(({ id, label, icon: Icon }) => (
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

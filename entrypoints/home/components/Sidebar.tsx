import { MessageSquare, Puzzle, Settings } from 'lucide-react'

type Page = 'chat' | 'skills' | 'settings'

interface SidebarProps {
  activePage: Page
  onNavigate: (page: Page) => void
}

const navItems: { id: Page; label: string; icon: typeof MessageSquare }[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'skills', label: 'Skills', icon: Puzzle },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <aside className="flex h-full w-56 flex-col border-r border-border/40 bg-muted/30">
      <div className="flex items-center gap-2 px-4 py-4">
        <img src="/icon/icon32.png" alt="ocbot" className="h-6 w-6" />
        <span className="text-base font-semibold">ocbot</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-2">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
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
    </aside>
  )
}

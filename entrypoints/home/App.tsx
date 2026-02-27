import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatPage } from './pages/ChatPage'

type Page = 'chat' | 'skills' | 'settings'

export function App() {
  const [page, setPage] = useState<Page>(() => {
    // Read initial page from URL hash: #/chat, #/settings, etc.
    const hash = window.location.hash.replace('#/', '')
    if (hash === 'skills' || hash === 'settings') return hash
    return 'chat'
  })

  return (
    <div className="flex h-screen w-screen bg-background text-foreground">
      <Sidebar activePage={page} onNavigate={setPage} />
      <main className="flex-1 overflow-hidden">
        {page === 'chat' && <ChatPage />}
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

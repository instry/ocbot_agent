import { Send, Square, ChevronDown, Search, Plus, Check, ArrowLeft, ExternalLink, X } from 'lucide-react'
import { useState, useCallback, useRef, useEffect, useMemo, forwardRef, useImperativeHandle, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useInputHistory } from '@/lib/hooks/useInputHistory'
import { getModelDisplayName, getTemplateByType, PROVIDER_TEMPLATES } from '@/lib/llm/models'
import type { LlmProvider, ProviderType } from '@/lib/llm/types'

export interface ChatInputHandle {
  setInput: (text: string) => void
}

interface ChatInputProps {
  onSend: (text: string) => void
  onStop?: () => void
  isLoading?: boolean
  disabled?: boolean
  variant?: 'footer' | 'standalone' | 'centered'
  rows?: number
  minHeight?: string
  providers?: LlmProvider[]
  selectedProvider?: LlmProvider | null
  onSelectProvider?: (id: string) => void
  onSaveProvider?: (provider: LlmProvider) => Promise<void>
  onDeleteProvider?: (id: string) => Promise<void>
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput({
  onSend, onStop, isLoading = false, disabled = false, variant = 'footer',
  rows = 1, minHeight = 'min-h-[42px]',
  providers, selectedProvider, onSelectProvider, onSaveProvider, onDeleteProvider,
}, ref) {
  const [input, setInput] = useState('')
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [dialog, setDialog] = useState<'connect' | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const { navigateUp, navigateDown, resetNavigation, addEntry } = useInputHistory()

  useImperativeHandle(ref, () => ({ setInput }), [])

  const showSelector = !!(providers && onSelectProvider)

  useEffect(() => {
    if (!popoverOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setPopoverOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [popoverOpen])

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault()
    if (isLoading && onStop) { onStop(); return }
    if (!input.trim() || disabled) return
    addEntry(input.trim())
    resetNavigation()
    onSend(input.trim())
    setInput('')
  }, [input, isLoading, disabled, onSend, onStop, addEntry, resetNavigation])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault(); handleSubmit(); return
    }
    const textarea = e.currentTarget
    if (e.key === 'ArrowUp') {
      const atStart = textarea.selectionStart === 0 && textarea.selectionEnd === 0
      if (input === '' || atStart) {
        const prev = navigateUp(input)
        if (prev !== null) { e.preventDefault(); setInput(prev) }
      }
      return
    }
    if (e.key === 'ArrowDown') {
      const atEnd = textarea.selectionStart === input.length
      if (atEnd) {
        const next = navigateDown()
        if (next !== null) { e.preventDefault(); setInput(next) }
      }
    }
  }, [handleSubmit, input, navigateUp, navigateDown])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value); resetNavigation()
  }, [resetNavigation])

  const containerClasses = variant === 'footer'
    ? 'border-t border-border/40 bg-background/80 p-3 backdrop-blur-md'
    : 'w-full'

  return (
    <div className={containerClasses}>
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }} className="w-full">
        <div className="rounded-2xl border border-border/50 bg-muted/50 shadow-sm transition-colors hover:border-border focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          <textarea
            className={`${minHeight} max-h-48 w-full resize-none rounded-t-2xl bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/70`}
            value={input} onChange={handleChange} onKeyDown={handleKeyDown}
            placeholder="Ask me to complete a task..." rows={rows} disabled={disabled}
          />
          <div className="flex items-center justify-between px-3 pb-2">
            <div>
              {showSelector && (
                <div ref={popoverRef} className="relative">
                  <button
                    type="button" onClick={() => setPopoverOpen(!popoverOpen)}
                    className="group flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-muted"
                  >
                    {selectedProvider ? (
                      <>
                        <span className="text-muted-foreground/50 transition-colors group-hover:text-muted-foreground">
                          {getTemplateByType(selectedProvider.type)?.name}
                        </span>
                        <span className="font-medium text-foreground/80 transition-colors group-hover:text-foreground">
                          {getModelDisplayName(selectedProvider)}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Select model</span>
                    )}
                    <ChevronDown className="h-3 w-3 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
                  </button>
                  {popoverOpen && (
                    <ModelPopover
                      providers={providers!}
                      selectedProvider={selectedProvider ?? null}
                      onSelect={(id) => { onSelectProvider!(id); setPopoverOpen(false) }}
                      onClose={() => setPopoverOpen(false)}
                      onConnect={onSaveProvider ? () => { setPopoverOpen(false); setDialog('connect') } : undefined}
                    />
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isLoading && onStop ? (
                <button type="button" onClick={onStop} className="cursor-pointer rounded-full bg-destructive p-2 text-destructive-foreground shadow-sm transition-all hover:bg-destructive/80" title="Stop">
                  <Square className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button type="submit" disabled={!input.trim() || disabled} className="cursor-pointer rounded-full bg-primary p-2 text-primary-foreground shadow-sm transition-all hover:bg-primary/80 disabled:opacity-50">
                  <Send className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </form>

      {/* Dialogs */}
      {dialog === 'connect' && onSaveProvider && (
        <ConnectProviderDialog
          onClose={() => setDialog(null)}
          onSave={async (p) => { await onSaveProvider(p); setDialog(null) }}
        />
      )}
    </div>
  )
})

// ============================================================
// Model Popover (small, for selecting current model)
// ============================================================

function ModelPopover({ providers, selectedProvider, onSelect, onClose, onConnect }: {
  providers: LlmProvider[]
  selectedProvider: LlmProvider | null
  onSelect: (id: string) => void
  onClose: () => void
  onConnect?: () => void
}) {
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => { requestAnimationFrame(() => searchRef.current?.focus()) }, [])

  const grouped = useMemo(() => {
    const q = search.toLowerCase().trim()
    const groups: { name: string; items: { provider: LlmProvider; modelName: string; contextWindow?: number }[] }[] = []
    for (const p of providers) {
      const template = getTemplateByType(p.type)
      const groupName = template?.name ?? p.type
      const model = template?.models.find(m => m.id === p.modelId)
      const modelName = model?.name ?? p.modelId
      const contextWindow = model?.contextWindow
      if (q && !groupName.toLowerCase().includes(q) && !modelName.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q)) continue
      let group = groups.find(g => g.name === groupName)
      if (!group) { group = { name: groupName, items: [] }; groups.push(group) }
      group.items.push({ provider: p, modelName, contextWindow })
    }
    return groups
  }, [providers, search])

  return (
    <div
      className="absolute bottom-full left-0 mb-1.5 flex w-72 flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
      style={{ maxHeight: '320px' }}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }}
    >
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        <input ref={searchRef} type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search models..." className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50" />
        {onConnect && (
          <button type="button" onClick={onConnect} className="cursor-pointer rounded-md p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-muted-foreground" title="Connect provider">
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {grouped.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            {providers.length === 0 ? (
              <div className="flex flex-col items-center gap-2">
                <span>No providers configured</span>
                {onConnect && <button type="button" onClick={onConnect} className="cursor-pointer text-primary hover:underline">Connect a provider</button>}
              </div>
            ) : 'No models found'}
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.name}>
              <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{group.name}</div>
              {group.items.map(({ provider: p, modelName, contextWindow }) => {
                const isSelected = selectedProvider?.id === p.id
                return (
                  <button key={p.id} type="button" onClick={() => onSelect(p.id)}
                    className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                    <span className="flex-1 truncate">
                      {p.name !== (getTemplateByType(p.type)?.name ?? p.type) && <span className="mr-1.5 text-muted-foreground">{p.name}</span>}
                      <span className={isSelected ? 'font-medium' : ''}>{modelName}</span>
                    </span>
                    {contextWindow && (
                      <span className="shrink-0 text-[10px] text-muted-foreground/50">
                        {contextWindow >= 1000000 ? `${(contextWindow / 1000000).toFixed(0)}M` : `${(contextWindow / 1000).toFixed(0)}k`}
                      </span>
                    )}
                    {isSelected && <Check className="h-3 w-3 shrink-0 text-primary" />}
                  </button>
                )
              })}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ============================================================
// Dialog Overlay (shared shell)
// ============================================================

function DialogOverlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl">
        {children}
      </div>
    </div>,
    document.body,
  )
}

// ============================================================
// Connect Provider Dialog
// ============================================================

function ConnectProviderDialog({ onClose, onSave }: {
  onClose: () => void
  onSave: (provider: LlmProvider) => Promise<void>
}) {
  const [selectedType, setSelectedType] = useState<ProviderType | null>(null)

  if (selectedType) {
    return (
      <DialogOverlay onClose={onClose}>
        <ConnectFormPanel
          type={selectedType}
          onBack={() => setSelectedType(null)}
          onClose={onClose}
          onSave={onSave}
        />
      </DialogOverlay>
    )
  }

  return (
    <DialogOverlay onClose={onClose}>
      <ConnectPickPanel onClose={onClose} onPick={setSelectedType} />
    </DialogOverlay>
  )
}

function ConnectPickPanel({ onClose, onPick }: { onClose: () => void; onPick: (type: ProviderType) => void }) {
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => { requestAnimationFrame(() => searchRef.current?.focus()) }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return PROVIDER_TEMPLATES
    return PROVIDER_TEMPLATES.filter(t => t.name.toLowerCase().includes(q) || t.type.toLowerCase().includes(q))
  }, [search])

  return (
    <>
      <div className="flex items-center justify-between border-b border-border/40 px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">Connect Provider</h2>
        <button type="button" onClick={onClose} className="cursor-pointer rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="border-b border-border/40 px-5 py-2.5">
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground/60" />
          <input ref={searchRef} type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search providers..." className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No providers found</div>
        ) : filtered.map(t => (
          <button key={t.type} type="button" onClick={() => onPick(t.type)}
            className="flex w-full cursor-pointer items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-muted">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/80 text-xs font-bold text-muted-foreground">
              {t.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">{t.name}</div>
              <div className="truncate text-xs text-muted-foreground/60">
                {t.models.length > 0 ? t.models.map(m => m.name).join(', ') : 'Custom endpoint'}
              </div>
            </div>
            <Plus className="h-4 w-4 shrink-0 text-muted-foreground/30" />
          </button>
        ))}
      </div>
    </>
  )
}

function ConnectFormPanel({ type, onBack, onClose, onSave }: {
  type: ProviderType; onBack: () => void; onClose: () => void
  onSave: (provider: LlmProvider) => Promise<void>
}) {
  const template = getTemplateByType(type)
  const [apiKey, setApiKey] = useState('')
  const isCustom = type === 'openai-compatible' || type === 'local'
  const [baseUrl, setBaseUrl] = useState(isCustom ? (template?.defaultBaseUrl ?? '') : '')
  const [modelId, setModelId] = useState(isCustom ? '' : '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { requestAnimationFrame(() => inputRef.current?.focus()) }, [])

  const handleSubmit = async () => {
    if (!apiKey.trim() && !isCustom) return
    if (isCustom && !modelId.trim()) return
    setSaving(true)
    try {
      await onSave({
        id: crypto.randomUUID(), type,
        name: template?.name ?? type,
        apiKey: apiKey.trim(),
        baseUrl: isCustom ? baseUrl.trim() : template?.defaultBaseUrl,
        modelId: isCustom ? modelId.trim() : (template?.defaultModelId ?? ''),
        createdAt: Date.now(), updatedAt: Date.now(),
      })
    } finally { setSaving(false) }
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border/40 px-5 py-4">
        <button type="button" onClick={onBack} className="cursor-pointer rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-3 flex-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/80 text-xs font-bold text-muted-foreground">
            {(template?.name ?? type).slice(0, 2).toUpperCase()}
          </div>
          <h2 className="text-sm font-semibold text-foreground">Connect {template?.name ?? type}</h2>
        </div>
        <button type="button" onClick={onClose} className="cursor-pointer rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5">
        {/* API Key */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">API Key</label>
            {template?.apiKeyUrl && (
              <a href={template.apiKeyUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                Get key <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <input ref={inputRef} type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
            placeholder={template?.apiKeyPlaceholder ?? 'Enter API key'}
            onKeyDown={e => { if (e.key === 'Enter' && !isCustom) { e.preventDefault(); e.stopPropagation(); handleSubmit() } }}
            className="w-full rounded-xl border border-border/50 bg-muted/50 px-4 py-2.5 text-sm outline-none transition-colors hover:border-border focus:border-primary" />
        </div>
        {/* Custom endpoint fields */}
        {isCustom && (
          <>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Base URL</label>
              <input type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="http://localhost:11434/v1"
                className="w-full rounded-xl border border-border/50 bg-muted/50 px-4 py-2.5 text-sm outline-none transition-colors hover:border-border focus:border-primary" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Model ID</label>
              <input type="text" value={modelId} onChange={e => setModelId(e.target.value)} placeholder="e.g. llama3.2:latest"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); handleSubmit() } }}
                className="w-full rounded-xl border border-border/50 bg-muted/50 px-4 py-2.5 text-sm outline-none transition-colors hover:border-border focus:border-primary" />
            </div>
          </>
        )}
        {/* Info about models */}
        {!isCustom && template && template.models.length > 1 && (
          <p className="text-xs text-muted-foreground">
            {template.name} has {template.models.length} models available. You can enable more models after connecting via Manage Models.
          </p>
        )}
        {/* Submit */}
        <button type="button" onClick={handleSubmit} disabled={saving || (!apiKey.trim() && !isCustom) || (isCustom && !modelId.trim())}
          className="cursor-pointer rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-50">
          {saving ? 'Connecting...' : 'Connect'}
        </button>
      </div>
    </>
  )
}

import { Send, Square, ChevronDown } from 'lucide-react'
import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useInputHistory } from '@/lib/hooks/useInputHistory'
import { getModelDisplayName } from '@/lib/llm/models'
import type { LlmProvider } from '@/lib/llm/types'

export interface ChatInputHandle {
  setInput: (text: string) => void
}

interface ChatInputProps {
  onSend: (text: string) => void
  onStop?: () => void
  isLoading?: boolean
  disabled?: boolean
  variant?: 'footer' | 'standalone'
  rows?: number
  minHeight?: string
  // LLM dropdown (optional — omit to hide)
  providers?: LlmProvider[]
  selectedProvider?: LlmProvider | null
  onSelectProvider?: (id: string) => void
  onConfigureLlm?: () => void
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput({
  onSend,
  onStop,
  isLoading = false,
  disabled = false,
  variant = 'footer',
  rows = 1,
  minHeight = 'min-h-[42px]',
  providers,
  selectedProvider,
  onSelectProvider,
  onConfigureLlm,
}, ref) {
  const [input, setInput] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { navigateUp, navigateDown, resetNavigation, addEntry } = useInputHistory()

  useImperativeHandle(ref, () => ({ setInput }), [])

  const showDropdown = !!(providers && onSelectProvider)

  useEffect(() => {
    if (!dropdownOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [dropdownOpen])

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault()
    if (isLoading && onStop) {
      onStop()
      return
    }
    if (!input.trim() || disabled) return
    addEntry(input.trim())
    resetNavigation()
    onSend(input.trim())
    setInput('')
  }, [input, isLoading, disabled, onSend, onStop, addEntry, resetNavigation])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault()
      handleSubmit()
      return
    }

    const textarea = e.currentTarget

    if (e.key === 'ArrowUp') {
      const atStart = textarea.selectionStart === 0 && textarea.selectionEnd === 0
      if (input === '' || atStart) {
        const prev = navigateUp(input)
        if (prev !== null) {
          e.preventDefault()
          setInput(prev)
        }
      }
      return
    }

    if (e.key === 'ArrowDown') {
      const atEnd = textarea.selectionStart === input.length
      if (atEnd) {
        const next = navigateDown()
        if (next !== null) {
          e.preventDefault()
          setInput(next)
        }
      }
      return
    }
  }, [handleSubmit, input, navigateUp, navigateDown])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    resetNavigation()
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
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask me to complete a task..."
            rows={rows}
            disabled={disabled}
          />
          <div className="flex items-center justify-between px-3 pb-2">
            <div />
            <div className="flex items-center gap-2">
              {showDropdown && (
                <div ref={dropdownRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {selectedProvider ? getModelDisplayName(selectedProvider) : 'Select model'}
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {dropdownOpen && (
                    <div className="absolute right-0 bottom-full mb-1 min-w-[180px] rounded-lg border border-border bg-popover p-1 shadow-lg">
                      {providers!.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => { setDropdownOpen(false); onConfigureLlm?.() }}
                          className="w-full cursor-pointer rounded-md px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          Configure LLM...
                        </button>
                      ) : (
                        providers!.map((p) => (
                          <button
                            type="button"
                            key={p.id}
                            onClick={() => { onSelectProvider!(p.id); setDropdownOpen(false) }}
                            className={`w-full cursor-pointer rounded-md px-3 py-2 text-left text-xs transition-colors hover:bg-muted ${
                              selectedProvider?.id === p.id ? 'text-primary font-medium' : 'text-foreground'
                            }`}
                          >
                            {getModelDisplayName(p)}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
              {isLoading && onStop ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="cursor-pointer rounded-full bg-destructive p-2 text-destructive-foreground shadow-sm transition-all hover:bg-destructive/80"
                  title="Stop"
                >
                  <Square className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() || disabled}
                  className="cursor-pointer rounded-full bg-primary p-2 text-primary-foreground shadow-sm transition-all hover:bg-primary/80 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  )
})

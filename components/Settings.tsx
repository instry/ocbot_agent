import { useState, useRef, useEffect, type ReactNode } from 'react'
import { Sliders, Cpu, Plus, Trash2, Pencil, Star, ArrowLeft, ChevronDown, Sun, Moon, Monitor, Globe, User, LogOut, Mail, Laptop } from 'lucide-react'
import type { LlmProvider } from '@/lib/llm/types'
import { getTemplateByType } from '@/lib/llm/models'
import type { ColorScheme, Language } from '@/lib/hooks/useSettings'
import { ProviderForm } from './ProviderForm'
import type { User as SupabaseUser } from '@supabase/supabase-js'

// --- Types ---

type SettingsTab = 'general' | 'providers' | 'account'
type ProvidersView = 'list' | 'add' | 'edit'

interface SettingsProps {
  providers: LlmProvider[]
  selectedProvider: LlmProvider | null
  onSaveProvider: (provider: LlmProvider) => Promise<void>
  onDeleteProvider: (id: string) => Promise<void>
  onSelectProvider: (id: string) => Promise<void>
  colorScheme: ColorScheme
  language: Language
  onColorSchemeChange: (scheme: ColorScheme) => void
  onLanguageChange: (lang: Language) => void
  // Auth props
  user: SupabaseUser | null
  isAuthenticated: boolean
  authLoading: boolean
  onSignInWithEmail: (email: string, password: string) => Promise<void>
  onSignUpWithEmail: (email: string, password: string) => Promise<void>
  onSignInWithGoogle: () => Promise<void>
  onSignOut: () => Promise<void>
}

// --- Main Settings Component ---

export function Settings({
  providers, selectedProvider, onSaveProvider, onDeleteProvider, onSelectProvider,
  colorScheme, language, onColorSchemeChange, onLanguageChange,
  user, isAuthenticated, authLoading,
  onSignInWithEmail, onSignUpWithEmail, onSignInWithGoogle, onSignOut,
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('providers')
  const [providersView, setProvidersView] = useState<ProvidersView>('list')
  const [editingProvider, setEditingProvider] = useState<LlmProvider | null>(null)

  const tabs: { id: SettingsTab; label: string; icon: typeof Sliders }[] = [
    { id: 'providers', label: 'Models', icon: Cpu },
    { id: 'general', label: 'General', icon: Sliders },
    { id: 'account', label: 'Account', icon: User },
  ]

  return (
    <div className="flex h-full">
      {/* Left sidebar */}
      <div className="flex w-48 shrink-0 flex-col border-r border-border/40 bg-muted/20">
        <div className="flex flex-col gap-1 px-3 pt-6 pb-4">
          <h2 className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Settings</h2>
        </div>
        <nav className="flex flex-col gap-0.5 px-3">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setActiveTab(id); if (id === 'providers') setProvidersView('list') }}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                activeTab === id
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Right content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'general' && (
          <GeneralTab
            colorScheme={colorScheme}
            language={language}
            onColorSchemeChange={onColorSchemeChange}
            onLanguageChange={onLanguageChange}
          />
        )}
        {activeTab === 'providers' && (
          <ProvidersTab
            view={providersView}
            setView={setProvidersView}
            providers={providers}
            selectedProvider={selectedProvider}
            editingProvider={editingProvider}
            setEditingProvider={setEditingProvider}
            onSaveProvider={onSaveProvider}
            onDeleteProvider={onDeleteProvider}
            onSelectProvider={onSelectProvider}
          />
        )}
        {activeTab === 'account' && (
          <AccountTab
            user={user}
            isAuthenticated={isAuthenticated}
            loading={authLoading}
            onSignInWithEmail={onSignInWithEmail}
            onSignUpWithEmail={onSignUpWithEmail}
            onSignInWithGoogle={onSignInWithGoogle}
            onSignOut={onSignOut}
          />
        )}
      </div>
    </div>
  )
}

// --- General Tab ---

const COLOR_SCHEME_OPTIONS: { value: ColorScheme; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
]

function GeneralTab({
  colorScheme, language, onColorSchemeChange, onLanguageChange,
}: {
  colorScheme: ColorScheme
  language: Language
  onColorSchemeChange: (scheme: ColorScheme) => void
  onLanguageChange: (lang: Language) => void
}) {
  return (
    <div className="flex h-full flex-col px-8 pb-10">
      <div className="sticky top-0 z-10 bg-background pt-6 pb-6">
        <h2 className="text-base font-semibold text-foreground">General</h2>
      </div>

      <div className="flex max-w-[640px] flex-col gap-8">
        {/* Appearance Section */}
        <SettingsSection title="Appearance">
          <SettingsRow
            title="Color Scheme"
            description="Choose between light, dark, or system theme."
          >
            <div className="flex gap-1 rounded-lg border border-border/50 bg-muted/30 p-0.5">
              {COLOR_SCHEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => onColorSchemeChange(value)}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors ${
                    colorScheme === value
                      ? 'bg-background font-medium text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </SettingsRow>
        </SettingsSection>

        {/* Language Section */}
        <SettingsSection title="Language">
          <SettingsRow
            title="Display Language"
            description="Set the language for the interface."
          >
            <SelectDropdown
              options={LANGUAGE_OPTIONS}
              value={language}
              onChange={onLanguageChange}
            />
          </SettingsRow>
        </SettingsSection>
      </div>
    </div>
  )
}

// --- Providers Tab ---

function ProvidersTab({
  view, setView, providers, selectedProvider, editingProvider, setEditingProvider,
  onSaveProvider, onDeleteProvider, onSelectProvider,
}: {
  view: ProvidersView
  setView: (v: ProvidersView) => void
  providers: LlmProvider[]
  selectedProvider: LlmProvider | null
  editingProvider: LlmProvider | null
  setEditingProvider: (p: LlmProvider | null) => void
  onSaveProvider: (provider: LlmProvider) => Promise<void>
  onDeleteProvider: (id: string) => Promise<void>
  onSelectProvider: (id: string) => Promise<void>
}) {
  if (view === 'add') {
    return (
      <div className="flex h-full flex-col px-8 pb-10">
        <div className="sticky top-0 z-10 bg-background pt-6 pb-6">
          <button
            onClick={() => setView('list')}
            className="mb-3 flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Models
          </button>
          <h2 className="text-base font-semibold text-foreground">Set Model</h2>
        </div>
        <div className="max-w-[640px]">
          <ProviderForm
            onSave={async (p) => { await onSaveProvider(p); setView('list') }}
            onCancel={() => setView('list')}
          />
        </div>
      </div>
    )
  }

  if (view === 'edit' && editingProvider) {
    return (
      <div className="flex h-full flex-col px-8 pb-10">
        <div className="sticky top-0 z-10 bg-background pt-6 pb-6">
          <button
            onClick={() => setView('list')}
            className="mb-3 flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Models
          </button>
          <h2 className="text-base font-semibold text-foreground">Edit Model</h2>
          <p className="mt-1 text-sm text-muted-foreground">{getTemplateByType(editingProvider.type)?.name ?? editingProvider.type}</p>
        </div>
        <div className="max-w-[640px]">
          <ProviderForm
            initial={editingProvider}
            onSave={async (p) => { await onSaveProvider(p); setView('list') }}
            onCancel={() => setView('list')}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col px-8 pb-10">
      <div className="sticky top-0 z-10 bg-background pt-6 pb-6">
        <h2 className="text-base font-semibold text-foreground">Models</h2>
        <p className="mt-1 text-sm text-muted-foreground">Manage your LLM models.</p>
      </div>

      <div className="max-w-[640px] space-y-3">
        {providers.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No models configured yet. Add one to get started.
          </p>
        )}

        {providers.map(p => {
          const template = getTemplateByType(p.type)
          const model = template?.models.find(m => m.id === p.modelId)
          const isDefault = p.id === selectedProvider?.id

          return (
            <div
              key={p.id}
              className={`flex items-center justify-between rounded-xl border p-4 transition-colors ${
                isDefault
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-border/40 bg-card'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-sm font-semibold text-muted-foreground">
                  {(template?.name ?? p.type).slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{p.name}</span>
                    <span className="rounded-md border border-border/60 bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">
                      {template?.name ?? p.type}
                    </span>
                    {isDefault && (
                      <span className="flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        <Star className="h-2.5 w-2.5" />
                        Default
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {model?.name ?? p.modelId}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {!isDefault && (
                  <button
                    onClick={() => onSelectProvider(p.id)}
                    className="cursor-pointer rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    Set default
                  </button>
                )}
                <button
                  onClick={() => { setEditingProvider(p); setView('edit') }}
                  className="cursor-pointer rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onDeleteProvider(p.id)}
                  className="cursor-pointer rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        })}

        <button
          onClick={() => setView('add')}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Add Model
        </button>
      </div>
    </div>
  )
}

// --- Account Tab ---

function AccountTab({
  user, isAuthenticated, loading,
  onSignInWithEmail, onSignUpWithEmail, onSignInWithGoogle, onSignOut,
}: {
  user: SupabaseUser | null
  isAuthenticated: boolean
  loading: boolean
  onSignInWithEmail: (email: string, password: string) => Promise<void>
  onSignUpWithEmail: (email: string, password: string) => Promise<void>
  onSignInWithGoogle: () => Promise<void>
  onSignOut: () => Promise<void>
}) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [devices, setDevices] = useState<Array<{ id: string; device_name: string; last_seen: string }>>([])

  // Load devices when authenticated
  useEffect(() => {
    if (!isAuthenticated) return
    import('@/lib/auth/api').then(({ listDevices }) => {
      listDevices()
        .then(data => setDevices(data.devices || []))
        .catch(() => {})
    })
  }, [isAuthenticated])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mode === 'signin') {
        await onSignInWithEmail(email, password)
      } else {
        await onSignUpWithEmail(email, password)
      }
      setEmail('')
      setPassword('')
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  const handleGoogle = async () => {
    setError(null)
    try {
      await onSignInWithGoogle()
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed')
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col px-8 pb-10">
      <div className="sticky top-0 z-10 bg-background pt-6 pb-6">
        <h2 className="text-base font-semibold text-foreground">Account</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isAuthenticated ? 'Manage your account and devices.' : 'Sign in to sync your data across devices.'}
        </p>
      </div>

      <div className="flex max-w-[640px] flex-col gap-8">
        {isAuthenticated && user ? (
          <>
            {/* User Info */}
            <SettingsSection title="Profile">
              <SettingsRow
                title={user.email || 'User'}
                description={`Signed in since ${new Date(user.created_at).toLocaleDateString()}`}
              >
                <button
                  onClick={onSignOut}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </button>
              </SettingsRow>
            </SettingsSection>

            {/* Devices */}
            <SettingsSection title="Devices">
              {devices.length === 0 ? (
                <p className="py-3.5 text-sm text-muted-foreground">No devices registered.</p>
              ) : (
                devices.map(d => (
                  <SettingsRow
                    key={d.id}
                    title={d.device_name}
                    description={`Last seen: ${new Date(d.last_seen).toLocaleString()}`}
                  >
                    <Laptop className="h-4 w-4 text-muted-foreground" />
                  </SettingsRow>
                ))
              )}
            </SettingsSection>
          </>
        ) : (
          <>
            {/* Auth Form */}
            <SettingsSection title={mode === 'signin' ? 'Sign In' : 'Sign Up'}>
              <form onSubmit={handleSubmit} className="flex flex-col gap-3 py-4">
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
                {error && (
                  <p className="text-xs text-destructive">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  <Mail className="h-4 w-4" />
                  {submitting ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Sign Up'}
                </button>
              </form>
            </SettingsSection>

            {/* Google OAuth */}
            <SettingsSection title="Or continue with">
              <div className="py-4">
                <button
                  onClick={handleGoogle}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border/50 bg-background py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </button>
              </div>
            </SettingsSection>

            {/* Toggle mode */}
            <p className="text-center text-xs text-muted-foreground">
              {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null) }}
                className="cursor-pointer text-primary hover:underline"
              >
                {mode === 'signin' ? 'Sign Up' : 'Sign In'}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// --- Shared UI Components ---

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="pb-2 text-sm font-medium text-foreground">{title}</h3>
      <div className="rounded-xl bg-muted/30 px-4">
        {children}
      </div>
    </div>
  )
}

function SettingsRow({ title, description, children }: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/30 py-3.5 last:border-none">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function SelectDropdown<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = options.find(o => o.value === value)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 text-sm transition-colors hover:bg-muted/60"
      >
        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
        {current?.label}
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-[140px] rounded-lg border border-border bg-popover p-1 shadow-lg">
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`w-full cursor-pointer rounded-md px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted ${
                value === opt.value ? 'font-medium text-primary' : 'text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

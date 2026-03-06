import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, Star, GitFork, BadgeCheck, Play, Copy, ImageOff, Trash2, Pencil, Upload, XCircle, Check, Loader2 } from 'lucide-react'
import { getLocalSkillDetail, getMarketplaceSkillDetail, getSkillAbbr, skillStoreInstance, getRealSkill, type Skill, type SkillDetail } from '../data/skills'
import { publishSkill, unpublishSkill, cloneSkill as apiCloneSkill } from '@/lib/marketplace/api'
import type { Skill as RealSkill } from '@/lib/skills/types'
import { useAuth } from '@/lib/hooks/useAuth'

// ---------------------------------------------------------------------------
// Lightweight Markdown renderer — handles headings, lists, bold, code, hr
// ---------------------------------------------------------------------------

interface MdNode {
  type: 'heading' | 'p' | 'ul' | 'ol' | 'hr' | 'code_block'
  level?: number   // 1-6 for headings
  content?: string
  items?: string[]
  lang?: string
}

/** Normalise literal \n sequences that some LLMs produce inside JSON strings. */
function normaliseMd(text: string): string {
  // If the text contains literal \n but no real newlines, unescape them
  if (!text.includes('\n') && text.includes('\\n')) {
    return text.replace(/\\n/g, '\n')
  }
  return text
}

function isHeading(line: string): { level: number; text: string } | null {
  const m = line.match(/^(#{1,6})\s+(.*)$/)
  if (m) return { level: m[1].length, text: m[2] }
  return null
}

function isUnorderedListItem(line: string): string | null {
  const m = line.match(/^\s*[-*+]\s+(.*)$/)
  return m ? m[1] : null
}

function isOrderedListItem(line: string): string | null {
  const m = line.match(/^\s*\d+[.)]\s+(.*)$/)
  return m ? m[1] : null
}

function parseMd(raw: string): MdNode[] {
  const text = normaliseMd(raw)
  const lines = text.split('\n')
  const nodes: MdNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      nodes.push({ type: 'code_block', content: codeLines.join('\n'), lang })
      if (i < lines.length) i++ // skip closing ```
      continue
    }

    // Blank line
    if (line.trim() === '') { i++; continue }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      nodes.push({ type: 'hr' })
      i++
      continue
    }

    // Headings
    const heading = isHeading(line)
    if (heading) {
      nodes.push({ type: 'heading', level: heading.level, content: heading.text })
      i++
      continue
    }

    // Unordered list
    if (isUnorderedListItem(line) !== null) {
      const items: string[] = []
      while (i < lines.length) {
        const item = isUnorderedListItem(lines[i])
        if (item === null) break
        items.push(item)
        i++
      }
      nodes.push({ type: 'ul', items })
      continue
    }

    // Ordered list
    if (isOrderedListItem(line) !== null) {
      const items: string[] = []
      while (i < lines.length) {
        const item = isOrderedListItem(lines[i])
        if (item === null) break
        items.push(item)
        i++
      }
      nodes.push({ type: 'ol', items })
      continue
    }

    // Paragraph — collect consecutive lines that don't match any block pattern
    const paraLines: string[] = []
    while (i < lines.length && lines[i].trim() !== '') {
      // Stop if next line starts a new block
      const next = lines[i]
      if (
        isHeading(next) ||
        isUnorderedListItem(next) !== null ||
        isOrderedListItem(next) !== null ||
        next.trimStart().startsWith('```') ||
        /^(-{3,}|\*{3,}|_{3,})\s*$/.test(next.trim())
      ) break
      paraLines.push(next)
      i++
    }
    if (paraLines.length > 0) {
      nodes.push({ type: 'p', content: paraLines.join('\n') })
    } else {
      // Safety: if nothing matched, consume the line as a paragraph to avoid infinite loop
      nodes.push({ type: 'p', content: line })
      i++
    }
  }

  return nodes
}

/** Render inline markdown: **bold**, `code`, *italic* */
function InlineText({ text }: { text: string }) {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`|\*[^*]+?\*)/g)
  return (
    <>
      {parts.map((part, j) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={j} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return <code key={j} className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">{part.slice(1, -1)}</code>
        }
        if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
          return <em key={j} className="italic">{part.slice(1, -1)}</em>
        }
        return <span key={j}>{part}</span>
      })}
    </>
  )
}

function RenderedMarkdown({ text }: { text: string }) {
  const nodes = useMemo(() => parseMd(text || ''), [text])

  return (
    <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
      {nodes.map((node, i) => {
        switch (node.type) {
          case 'heading': {
            const cls = node.level === 1
              ? 'text-base font-semibold text-foreground'
              : node.level === 2
                ? 'text-sm font-semibold text-foreground'
                : 'text-sm font-medium text-foreground'
            const Tag = (node.level! <= 2 ? 'h3' : 'h4') as 'h3' | 'h4'
            return <Tag key={i} className={cls}><InlineText text={node.content!} /></Tag>
          }
          case 'hr':
            return <hr key={i} className="border-border/40" />
          case 'code_block':
            return (
              <pre key={i} className="overflow-x-auto rounded-lg bg-muted/80 px-4 py-3 font-mono text-xs text-foreground">
                {node.content}
              </pre>
            )
          case 'ul':
            return (
              <ul key={i} className="list-disc space-y-1 pl-5">
                {node.items!.map((item, j) => (
                  <li key={j}><InlineText text={item} /></li>
                ))}
              </ul>
            )
          case 'ol':
            return (
              <ol key={i} className="list-decimal space-y-1 pl-5">
                {node.items!.map((item, j) => (
                  <li key={j}><InlineText text={item} /></li>
                ))}
              </ol>
            )
          case 'p':
            return (
              <p key={i} className="whitespace-pre-line">
                <InlineText text={node.content!} />
              </p>
            )
          default:
            return null
        }
      })}
    </div>
  )
}

function DetailIcon({ detail, className = 'h-16 w-16' }: { detail: SkillDetail; className?: string }) {
  if (detail.iconUrl) {
    return <img src={detail.iconUrl} alt={detail.name} className={`${className} rounded-2xl object-cover`} />
  }
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-2xl bg-primary/20 text-xl font-bold text-primary ${className}`}>
      {getSkillAbbr(detail.name)}
    </div>
  )
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return n.toString()
}

export function SkillDetailPage({ skill, onBack, backLabel = 'Back to Marketplace', onRun, onDelete, onEdit, onCloned }: {
  skill: Skill; onBack: () => void; backLabel?: string;
  onRun?: (skill: Skill) => void;
  onDelete?: (skillId: string) => void
  onEdit?: (skillId: string) => void
  onCloned?: () => void
}) {
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [cloning, setCloning] = useState(false)
  const [cloneSuccess, setCloneSuccess] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishedId, setPublishedId] = useState<string | null>(skill.publishedId || null)
  const { isAuthenticated, user } = useAuth()

  const isMarketplaceSkill = !!skill.publishedId
  const isLocalSkill = !!onEdit // onEdit is only provided for my-skills tab

  useEffect(() => {
    if (isMarketplaceSkill) {
      // Marketplace skill — fetch detail from server
      getMarketplaceSkillDetail(skill.id).then(remote => {
        if (remote) setDetail(remote)
      })
    } else {
      // Local skill — fetch from local store
      getLocalSkillDetail(skill.id).then(local => {
        if (local) setDetail(local)
      })
    }
  }, [skill.id, isMarketplaceSkill])

  // Check if local skill is already published
  useEffect(() => {
    if (!isLocalSkill || !isAuthenticated) return
    // Check local storage for publish mapping
    chrome.storage.local.get('ocbot_published_skills').then((result) => {
      const mapping = result.ocbot_published_skills || {}
      if (mapping[skill.id]) {
        setPublishedId(mapping[skill.id])
      }
    })
  }, [skill.id, isLocalSkill, isAuthenticated])

  const handleClone = async () => {
    if (!skill.publishedId) return
    setCloning(true)
    try {
      // Fetch the full marketplace skill to get the data blob
      const ms = await import('@/lib/marketplace/api').then(m => m.fetchMarketplaceSkill(skill.publishedId!))
      const skillData: RealSkill = JSON.parse(ms.data)

      // Create a cloned copy
      const clonedSkill: RealSkill = {
        ...skillData,
        id: crypto.randomUUID(),
        sourceSkillId: ms.skill_id,
        source: 'user',
        author: 'cloned',
        totalRuns: 0,
        successCount: 0,
        score: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'active',
      }

      await skillStoreInstance.save(clonedSkill)
      // Increment clone count on server (fire and forget)
      apiCloneSkill(skill.publishedId!).catch(() => {})
      setCloneSuccess(true)
      onCloned?.()
    } catch (e) {
      console.error('Failed to clone skill:', e)
    } finally {
      setCloning(false)
    }
  }

  const handlePublish = async () => {
    if (!isAuthenticated || !user) return
    setPublishing(true)
    try {
      const realSkill = await getRealSkill(skill.id)
      if (!realSkill) return

      const result = await publishSkill({
        skill_id: realSkill.id,
        author_name: user.email?.split('@')[0] || 'anonymous',
        name: realSkill.name,
        description: realSkill.description,
        categories: JSON.stringify(realSkill.categories),
        data: JSON.stringify(realSkill),
        version: realSkill.version,
      })

      // Save mapping locally
      const stored = await chrome.storage.local.get('ocbot_published_skills')
      const mapping = stored.ocbot_published_skills || {}
      mapping[skill.id] = result.id
      await chrome.storage.local.set({ ocbot_published_skills: mapping })
      setPublishedId(result.id)
    } catch (e) {
      console.error('Failed to publish skill:', e)
    } finally {
      setPublishing(false)
    }
  }

  const handleUnpublish = async () => {
    if (!publishedId) return
    setPublishing(true)
    try {
      await unpublishSkill(publishedId)
      // Remove from local mapping
      const stored = await chrome.storage.local.get('ocbot_published_skills')
      const mapping = stored.ocbot_published_skills || {}
      delete mapping[skill.id]
      await chrome.storage.local.set({ ocbot_published_skills: mapping })
      setPublishedId(null)
    } catch (e) {
      console.error('Failed to unpublish skill:', e)
    } finally {
      setPublishing(false)
    }
  }

  if (!detail) return null

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex cursor-pointer items-center gap-1.5 border-b border-border/40 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </button>

      <div className="flex flex-col gap-8 p-6">
        {/* Header */}
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-5">
            <DetailIcon detail={detail} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-semibold text-foreground">{detail.name}</h1>
                {detail.official && (
                  <span className="flex shrink-0 items-center gap-1 rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-500">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    Official
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                <span>by <span className="font-medium text-foreground">{detail.author}</span></span>
                <span className="text-border">·</span>
                <span className="font-mono">{detail.version}</span>
                <span className="text-border">·</span>
                <span>Updated {detail.updatedAt}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-sm text-muted-foreground">
                {detail.rating > 0 && (
                  <span className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span className="font-medium text-foreground">{detail.rating}</span>
                    <span>({detail.reviewCount} reviews)</span>
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <GitFork className="h-3.5 w-3.5" />
                  {formatCount(detail.installs)} clones
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            {isMarketplaceSkill && (
              <button
                onClick={handleClone}
                disabled={cloning || cloneSuccess}
                className="flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {cloning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : cloneSuccess ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {cloning ? 'Cloning…' : cloneSuccess ? 'Cloned!' : 'Clone'}
              </button>
            )}
            <button
              onClick={() => onRun?.(skill)}
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-border/60 px-5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80"
            >
              <Play className="h-4 w-4" />
              Run
            </button>
            {onEdit && (
              <button
                onClick={() => onEdit(skill.id)}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-border/60 px-5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </button>
            )}
            {isLocalSkill && isAuthenticated && !publishedId && (
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
              >
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {publishing ? 'Publishing…' : 'Publish'}
              </button>
            )}
            {isLocalSkill && isAuthenticated && publishedId && (
              <button
                onClick={handleUnpublish}
                disabled={publishing}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-amber-500/30 px-5 py-2 text-sm font-medium text-amber-600 transition-colors hover:bg-amber-500/10 disabled:opacity-60"
              >
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                {publishing ? 'Unpublishing…' : 'Unpublish'}
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => { onDelete(skill.id); onBack() }}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-red-500/30 px-5 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            )}
          </div>
        </div>

        {/* Compatible sites + categories */}
        {(detail.compatibleSites.length > 0 || detail.categories.length > 0) && (
          <div className="flex flex-col gap-3 rounded-xl border border-border/40 bg-muted/30 px-5 py-4">
            {detail.compatibleSites.length > 0 && (
              <div className="flex items-start gap-3 text-sm">
                <span className="shrink-0 font-medium text-muted-foreground">Compatible sites</span>
                <div className="flex flex-wrap gap-1.5">
                  {detail.compatibleSites.map((site) => (
                    <span key={site} className="rounded-md border border-border/60 bg-card px-2 py-0.5 text-xs text-foreground">{site}</span>
                  ))}
                </div>
              </div>
            )}
            {detail.categories.length > 0 && (
              <div className="flex items-start gap-3 text-sm">
                <span className="shrink-0 font-medium text-muted-foreground">Categories</span>
                <div className="flex flex-wrap gap-1.5">
                  {detail.categories.map((cat) => (
                    <span key={cat} className="rounded-md border border-border/60 bg-card px-2 py-0.5 text-xs text-foreground">{cat}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* About */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">About</h2>
          <RenderedMarkdown text={detail.longDescription} />
        </section>

        {/* Parameters */}
        {detail.parameters.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">Parameters</h2>
            <div className="overflow-hidden rounded-xl border border-border/40">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/40">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Type</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Required</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Default</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.parameters.map((param, i) => (
                    <tr key={param.name} className={i < detail.parameters.length - 1 ? 'border-b border-border/30' : ''}>
                      <td className="px-4 py-2.5 font-mono text-xs text-foreground">{param.name}</td>
                      <td className="px-4 py-2.5">
                        <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{param.type}</span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{param.required ? 'Yes' : 'No'}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                        {param.default !== undefined ? String(param.default) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{param.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Screenshots */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">Screenshots</h2>
          {detail.screenshots.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {detail.screenshots.map((src, i) => (
                <img key={i} src={src} alt={`Screenshot ${i + 1}`} className="h-48 rounded-xl border border-border/40 object-cover" />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/60 px-5 py-8 text-sm text-muted-foreground/60">
              <ImageOff className="h-4 w-4" />
              No screenshots available
            </div>
          )}
        </section>

        {/* Changelog */}
        {detail.changelog.length > 0 && (
          <section className="pb-4">
            <h2 className="mb-3 text-lg font-semibold text-foreground">Changelog</h2>
            <div className="flex flex-col gap-4">
              {detail.changelog.map((entry) => (
                <div key={entry.version} className="relative pl-5 before:absolute before:left-0 before:top-[9px] before:h-2 before:w-2 before:rounded-full before:bg-primary/60">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-sm font-semibold text-foreground">{entry.version}</span>
                    <span className="text-xs text-muted-foreground">{entry.date}</span>
                  </div>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {entry.changes.map((change, i) => (
                      <li key={i} className="text-sm text-muted-foreground">– {change}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

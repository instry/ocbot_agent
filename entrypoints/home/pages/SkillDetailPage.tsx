import { ArrowLeft, Star, GitFork, BadgeCheck, Play, Download, ImageOff } from 'lucide-react'
import { getSkillDetail, getSkillAbbr, type Skill, type SkillDetail } from '../data/skills'

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

export function SkillDetailPage({ skill, onBack }: { skill: Skill; onBack: () => void }) {
  const detail = getSkillDetail(skill.id)
  if (!detail) return null

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex cursor-pointer items-center gap-1.5 border-b border-border/40 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Marketplace
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
                <span className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  <span className="font-medium text-foreground">{detail.rating}</span>
                  <span>({detail.reviewCount} reviews)</span>
                </span>
                <span className="flex items-center gap-1">
                  <GitFork className="h-3.5 w-3.5" />
                  {formatCount(detail.installs)} clones
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <button className="flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
              <Download className="h-4 w-4" />
              Clone
            </button>
            <button className="flex cursor-pointer items-center gap-2 rounded-xl border border-border/60 px-5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80">
              <Play className="h-4 w-4" />
              Run
            </button>
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
          <div className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {detail.longDescription.split('\n').map((line, i) => {
              // Render **bold** text
              const parts = line.split(/(\*\*.*?\*\*|`.*?`)/g)
              return (
                <span key={i}>
                  {parts.map((part, j) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                      return <strong key={j} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
                    }
                    if (part.startsWith('`') && part.endsWith('`')) {
                      return <code key={j} className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">{part.slice(1, -1)}</code>
                    }
                    return part
                  })}
                  {i < detail.longDescription.split('\n').length - 1 && '\n'}
                </span>
              )
            })}
          </div>
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

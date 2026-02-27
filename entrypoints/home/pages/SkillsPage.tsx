import { useState, useMemo } from 'react'
import { Search, ArrowRight, ChevronLeft, ChevronRight, BadgeCheck, GitFork } from 'lucide-react'
import { MOCK_SKILLS, getSkillAbbr, type Skill } from '../data/skills'

const CATEGORIES = [
  'All',
  'Search',
  'E-Commerce',
  'Financial',
  'News',
  'Real Estate',
  'Social Media',
  'Travel',
  'Marketplace',
  'Lead Generation',
  'SEO',
  'Jobs',
  'Developer',
  'Media',
  'Automation',
  'Integration',
  'Other',
]

function SkillIcon({ skill, className = "h-10 w-10" }: { skill: Skill, className?: string }) {
  if (skill.iconUrl) {
    return (
      <img
        src={skill.iconUrl}
        alt={skill.name}
        className={`${className} rounded-xl object-cover`}
      />
    )
  }
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-xl bg-primary/20 text-sm font-semibold text-primary ${className}`}>
      {getSkillAbbr(skill.name)}
    </div>
  )
}

function SkillCard({ skill }: { skill: Skill }) {
  return (
    <div className="flex flex-col rounded-xl border border-border/40 bg-card p-4 transition-all hover:bg-accent/50">
      <div className="flex items-start gap-4">
        <SkillIcon skill={skill} className="h-12 w-12" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-semibold text-foreground">{skill.name}</span>
            {skill.official && (
              <span className="flex shrink-0 items-center gap-1 rounded-md border border-orange-500/30 bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-500">
                <BadgeCheck className="h-3 w-3" />
                Official
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {skill.categories.map((cat) => (
              <span
                key={cat}
                className="rounded-md border border-border/60 bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {cat}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 flex-1 text-sm text-muted-foreground">
        {skill.description}
      </p>
      <div className="mt-3 flex items-center justify-between border-t border-border/30 pt-3 text-xs text-muted-foreground/80">
        <span className="font-mono">{skill.version}</span>
        {skill.installs > 0 ? (
          <span className="flex items-center gap-1.5">
            <GitFork className="h-3.5 w-3.5" />
            {skill.installs.toLocaleString()} clones
          </span>
        ) : (
          <span>Recently Added</span>
        )}
      </div>
    </div>
  )
}

export function SkillsPage() {
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 30

  const filtered = useMemo(() => {
    setPage(1)
    let skills = MOCK_SKILLS
    if (selectedCategory !== 'All') {
      skills = skills.filter((s) => s.categories.includes(selectedCategory))
    }
    if (query.trim()) {
      const q = query.toLowerCase()
      skills = skills.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q),
      )
    }
    return skills
  }, [query, selectedCategory])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Skill Marketplace
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Discover and clone community-built browser automation skills. Or,{' '}
            <span className="underline underline-offset-2">
              create your own
            </span>
            .
          </p>
        </div>
        <button className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground">
          My Skills <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="relative mt-4 max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search skills..."
          className="w-full rounded-xl border border-border/50 bg-muted/50 py-2.5 pl-9 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 hover:border-border focus:border-primary"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              selectedCategory === cat
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="mt-4 text-sm font-medium text-muted-foreground">
        {selectedCategory === 'All' ? 'All Skills' : selectedCategory} ({filtered.length})
      </div>

      <div className="mt-3 grid grid-cols-3 gap-4">
        {paged.map((skill) => (
          <SkillCard key={skill.id} skill={skill} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex flex-col items-center gap-2 pb-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 rounded-lg border border-border/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={`min-w-[36px] rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  n === page
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                }`}
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 rounded-lg border border-border/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground disabled:opacity-30"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <span className="text-xs text-muted-foreground">
            Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} skills
          </span>
        </div>
      )}
    </div>
  )
}

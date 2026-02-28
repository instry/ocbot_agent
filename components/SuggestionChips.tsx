const SUGGESTIONS = [
  'Search for flights',
  'Monitor prices',
  'Find leads',
  'Scrape job listings',
]

export function SuggestionChips({ onSelect }: { onSelect: (text: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {SUGGESTIONS.map((chip) => (
        <button
          key={chip}
          onClick={() => onSelect(chip)}
          className="cursor-pointer rounded-full border border-border/60 px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          {chip}
        </button>
      ))}
    </div>
  )
}

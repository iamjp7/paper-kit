type Thumb = {
  id: string
  src: string
  label: string
  selected?: boolean
}

type Props = {
  items: Thumb[]
  onSelect?: (id: string) => void
  activeId?: string
}

export default function PageFilmstrip({ items, onSelect, activeId }: Props) {
  if (items.length === 0) return null

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {items.map((item) => {
        const active = item.id === activeId || item.selected
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect?.(item.id)}
            className={`w-28 shrink-0 rounded-lg border bg-white p-1.5 text-left shadow-sm ${
              active ? 'border-teal-600 ring-2 ring-teal-200' : 'border-slate-200'
            }`}
          >
            <img src={item.src} alt="" className="h-32 w-full rounded object-contain bg-slate-100" />
            <div className="mt-1 truncate text-center text-xs text-slate-600">{item.label}</div>
          </button>
        )
      })}
    </div>
  )
}

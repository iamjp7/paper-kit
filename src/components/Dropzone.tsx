import { useCallback, useState, type DragEvent, type ReactNode } from 'react'

type Props = {
  onFiles: (files: File[]) => void
  multiple?: boolean
  title?: string
  hint?: string
  children?: ReactNode
}

function pdfFiles(list: FileList | File[]): File[] {
  return [...list].filter((file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name))
}

export default function Dropzone({
  onFiles,
  multiple = false,
  title = 'Drop a PDF here',
  hint = 'or click to choose a file. Processing stays on this device.',
  children,
}: Props) {
  const [active, setActive] = useState(false)

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault()
      setActive(false)
      const files = pdfFiles(event.dataTransfer.files)
      if (files.length) onFiles(multiple ? files : files.slice(0, 1))
    },
    [multiple, onFiles],
  )

  return (
    <label
      onDragOver={(event) => {
        event.preventDefault()
        setActive(true)
      }}
      onDragLeave={() => setActive(false)}
      onDrop={onDrop}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition ${
        active ? 'border-teal-600 bg-teal-50' : 'border-slate-300 bg-white hover:border-teal-500'
      }`}
    >
      <input
        type="file"
        accept="application/pdf,.pdf"
        multiple={multiple}
        className="sr-only"
        onChange={(event) => {
          const files = pdfFiles(event.target.files ?? [])
          if (files.length) onFiles(multiple ? files : files.slice(0, 1))
          event.target.value = ''
        }}
      />
      <span className="mb-2 text-3xl text-teal-700">↑</span>
      <span className="text-lg font-semibold text-slate-900">{title}</span>
      <span className="mt-1 max-w-md text-sm text-slate-500">{hint}</span>
      {children}
    </label>
  )
}

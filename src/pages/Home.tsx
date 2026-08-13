import { Link } from 'react-router-dom'
import PaperKitLogo from '../components/PaperKitLogo'

const tools = [
  {
    to: '/edit',
    title: 'Edit PDF',
    desc: 'Change existing text, add new text or images, and whiteout content.',
  },
  {
    to: '/compress',
    title: 'Compress PDF',
    desc: 'Shrink file size by recompressing embedded images in the browser.',
  },
  {
    to: '/merge',
    title: 'Merge PDF',
    desc: 'Combine several PDFs, then reorder or drop pages before download.',
  },
  {
    to: '/delete-pages',
    title: 'Delete pages',
    desc: 'Select pages to remove and keep the rest in a new file.',
  },
]

export default function Home() {
  return (
    <div>
      <div className="mx-auto max-w-3xl text-center">
        <div className="flex justify-center">
          <PaperKitLogo size={72} />
        </div>
        <p className="mt-4 text-sm font-medium tracking-wide text-teal-700">PaperKit</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">
          Edit, compress, and combine PDFs in your browser.
        </h1>
        <p className="mt-3 text-slate-600">
          PaperKit runs entirely on this device. Files are not uploaded.
        </p>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {tools.map((tool) => (
          <Link
            key={tool.to}
            to={tool.to}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-600 hover:shadow-md"
          >
            <h2 className="text-lg font-semibold text-slate-900">{tool.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{tool.desc}</p>
            <span className="mt-4 inline-block text-sm font-medium text-teal-700">Open tool →</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

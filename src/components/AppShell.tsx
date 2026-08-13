import { NavLink, Outlet } from 'react-router-dom'
import PaperKitLogo from './PaperKitLogo'

const links = [
  { to: '/edit', label: 'Edit' },
  { to: '/compress', label: 'Compress' },
  { to: '/merge', label: 'Merge' },
  { to: '/delete-pages', label: 'Delete pages' },
]

export default function AppShell() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <NavLink
            to="/"
            className="no-underline"
          >
            <PaperKitLogo size={32} showWordmark />
          </NavLink>
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `inline-block rounded-full px-3 py-1.5 no-underline ${
                    isActive
                      ? 'bg-teal-700 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dist = 'dist'
const expectedBase = process.env.VITE_BASE_PATH ?? readProductionBase()

function readProductionBase() {
  try {
    const env = readFileSync('.env.production', 'utf8')
    const match = env.match(/^VITE_BASE_PATH=(.+)$/m)
    return match?.[1]?.trim() || '/'
  } catch {
    return '/'
  }
}

function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walk(path))
    else files.push(path)
  }
  return files
}

const rootRelative = [
  '="/assets/',
  "='/assets/",
  '="/fonts/',
  "='/fonts/",
  '="/favicon',
  "='/favicon",
  '="/logo.',
  "='/logo.",
]

const files = walk(dist)
const problems = []

for (const file of files) {
  if (!/\.(html|js|mjs|css)$/.test(file)) continue
  const text = readFileSync(file, 'utf8')
  for (const pattern of rootRelative) {
    if (!text.includes(pattern)) continue
    // Allow when the deployment base is root.
    if (expectedBase === '/') continue
    problems.push(`${file}: found ${pattern} (expected paths under ${expectedBase})`)
  }
}

if (problems.length > 0) {
  console.error('Build path validation failed:\n' + problems.join('\n'))
  process.exit(1)
}

console.log(`Build path validation passed (base: ${expectedBase})`)

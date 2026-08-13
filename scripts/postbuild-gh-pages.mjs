import { copyFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = 'dist'
const index = join(dist, 'index.html')
const fallback = join(dist, '404.html')

copyFileSync(index, fallback)
console.log('Created dist/404.html for GitHub Pages SPA routing')

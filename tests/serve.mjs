/**
 * App ke liye chhota static server.
 *
 * `index.html` ko seedha file:// se kholna kaam nahi karta (ES modules), aur
 * Firebase ko bhi asli origin chahiye. Is se zyada is ka koi kaam nahi.
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, extname, normalize } from 'node:path'

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT || 5500)

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  let path = decodeURIComponent(url.pathname)
  if (path === '/') path = '/index.html'

  // Path traversal se bachao — ye test ka server hai, phir bhi.
  const file = resolve(APP, `.${normalize(path)}`)
  if (!file.startsWith(APP)) {
    res.writeHead(403).end('nope')
    return
  }

  try {
    const body = await readFile(file)
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
    })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
}).listen(PORT, () => console.log(`app: http://localhost:${PORT}`))

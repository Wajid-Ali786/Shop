/**
 * Saare test chalata hai — ya sirf wo jo aap ne naam liye.
 *
 *   node tests/run.mjs            saare
 *   node tests/run.mjs khata      sirf khata
 *
 * Har spec apne alag process me chalti hai. Ye jaan boojh kar hai: ek spec ka
 * browser ya emulator ka bigra hua haal agle par nahi jata, aur ek ke crash
 * hone par baqi phir bhi chal jate hain.
 */
import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const SPECS = resolve(HERE, 'specs')

const wanted = process.argv.slice(2)
const all = (await readdir(SPECS)).filter((f) => f.endsWith('.mjs')).sort()
const specs = wanted.length
  ? all.filter((f) => wanted.some((w) => f.includes(w)))
  : all

if (!specs.length) {
  console.error(`Koi spec nahi mili. Mojood hain: ${all.join(', ')}`)
  process.exit(1)
}

const run = (file) =>
  new Promise((done) => {
    const child = spawn(process.execPath, [resolve(SPECS, file)], { stdio: 'inherit' })
    child.on('exit', (code) => done(code === 0))
  })

const failed = []
for (const spec of specs) {
  console.log(`\n${'='.repeat(60)}\n  ${spec}\n${'='.repeat(60)}`)
  if (!(await run(spec))) failed.push(spec)
}

console.log(`\n${'='.repeat(60)}`)
if (failed.length) {
  console.log(`❌ ${failed.length}/${specs.length} spec fail hui: ${failed.join(', ')}`)
  process.exit(1)
}
console.log(`✅ Saari ${specs.length} spec pass`)

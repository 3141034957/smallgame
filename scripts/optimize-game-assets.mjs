import { spawnSync } from 'node:child_process'
import { mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BAND_CHARACTERS } from '../src/features/farm/characterRoster.mjs'
import { MONSTERS } from '../src/features/farm/monsters.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const encoder = spawnSync('cwebp', ['-version'], { encoding: 'utf8' })
if (encoder.error || encoder.status !== 0) {
  console.error('需要 cwebp：macOS 可运行 brew install webp，再重新执行 npm run assets:optimize。')
  process.exit(1)
}

let before = 0,
  after = 0
for (const { image } of [...BAND_CHARACTERS, ...MONSTERS]) {
  const relative = image.replace(/^\.\/assets\//, '')
  const source = resolve(root, 'design-assets', relative.replace(/\.webp$/, '.png'))
  const target = resolve(root, 'public/assets', relative)
  const temporary = `${target}.tmp`
  mkdirSync(dirname(target), { recursive: true })
  // Keep original dimensions and lossless alpha; sharp YUV conversion protects fine edges.
  try {
    const result = spawnSync(
      'cwebp',
      [
        '-quiet',
        '-q',
        '95',
        '-sharp_yuv',
        '-alpha_q',
        '100',
        '-m',
        '6',
        '-metadata',
        'none',
        source,
        '-o',
        temporary,
      ],
      { encoding: 'utf8' },
    )
    if (result.error || result.status !== 0)
      throw new Error(result.error?.message || result.stderr || `无法压缩 ${source}`)
    const sourceBytes = statSync(source).size
    const targetBytes = statSync(temporary).size
    if (!targetBytes || targetBytes >= sourceBytes)
      throw new Error(`${relative} 未能有效压缩，请检查源图。`)
    renameSync(temporary, target)
    before += sourceBytes
    after += targetBytes
    console.log(
      `${relative}: ${(sourceBytes / 1024).toFixed(0)} → ${(targetBytes / 1024).toFixed(0)} KiB`,
    )
  } finally {
    rmSync(temporary, { force: true })
  }
}
console.log(
  `共 ${[...BAND_CHARACTERS, ...MONSTERS].length} 张：${(before / 1e6).toFixed(2)} → ${(after / 1e6).toFixed(2)} MB，减少 ${(100 * (1 - after / before)).toFixed(1)}%。`,
)

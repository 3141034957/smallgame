import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

// Execute the actual Bash workflow against isolated command doubles. Nothing
// touches /etc, invokes real sudo, opens ports or changes the host services.
function runService(action = 'install', mode = '') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'smallgame-service-')))
  const bin = join(root, 'bin'), log = join(root, 'calls')
  for (const folder of ['bin', 'scripts', 'server']) mkdirSync(join(root, folder))
  copyFileSync(new URL('./game-service.sh', import.meta.url), join(root, 'scripts/game-service.sh'))
  writeFileSync(join(root, 'package-lock.json'), '{}')
  writeFileSync(join(root, 'server/index.mjs'), '')
  writeFileSync(log, '')
  const command = (name, script) => writeFileSync(join(bin, name), '#!/bin/bash\nset -eu\n' + script, { mode: 0o755 })
  command('uname', 'echo Linux\n')
  command('id', 'if [[ "$1" == -u ]]; then echo 1000; else echo ubuntu; fi\n')
  // macOS readlink does not consistently provide -f; our fixture paths have no links.
  command('readlink', 'echo "$2"\n')
  command('node', 'exit 0\n')
  command('ss', 'exit 89\n')
  command('systemctl', 'exit 89\n')
  command('sudo', `printf 'sudo %s\n' "$*" >> "$SERVICE_TEST_ROOT/calls"
case "$1" in
  -v) exit 0 ;;
  ss) if [[ "$SERVICE_TEST_MODE" == busy ]]; then echo 'LISTEN 0 511 0.0.0.0:80 users:node'; fi ;;
  test) exit 1 ;;
  install) cp "$4" "$SERVICE_TEST_ROOT/unit" ;;
  journalctl) echo 'fixture startup error' ;;
  systemctl)
    case "$2" in
      is-active) [[ -f "$SERVICE_TEST_ROOT/restarted" ]] ;;
      restart) touch "$SERVICE_TEST_ROOT/restarted" ;;
      stop|status|enable|daemon-reload|reset-failed) exit 0 ;;
      *) exit 88 ;;
    esac ;;
  *) exit 88 ;;
esac
`)
  command('npm', `printf 'npm %s\n' "$*" >> "$SERVICE_TEST_ROOT/calls"
if [[ "$*" == test && "$SERVICE_TEST_MODE" == test-fails ]]; then exit 1; fi
if [[ "$*" == 'run build' ]]; then mkdir -p dist/client; echo '<html></html>' > dist/client/index.html; fi
`)
  command('systemd-analyze', `printf 'verify\n' >> "$SERVICE_TEST_ROOT/calls"
[[ -s "$2" ]]
`)
  command('curl', `printf 'curl %s\n' "$*" >> "$SERVICE_TEST_ROOT/calls"
[[ "$SERVICE_TEST_MODE" != unhealthy ]]
`)
  command('sleep', 'exit 0\n')
  try {
    const result = spawnSync('bash', [join(root, 'scripts/game-service.sh'), action], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, SERVICE_TEST_ROOT: root, SERVICE_TEST_MODE: mode },
      encoding: 'utf8', timeout: 30000,
    })
    return { ...result, calls: readFileSync(log, 'utf8'), unit: existsSync(join(root, 'unit')) ? readFileSync(join(root, 'unit'), 'utf8') : '', root }
  } finally { rmSync(root, { recursive: true, force: true }) }
}

describe('server service installation workflow', () => {
  it('installs only after checks and build, uses the detected paths, and checks both HTTP endpoints', () => {
    const result = runService()
    expect(result.status, result.stderr).toBe(0)
    expect(result.calls).toContain('npm ci\nnpm test\nnpm run lint\nnpm run build\nverify\n')
    expect(result.calls.indexOf('npm run build')).toBeLessThan(result.calls.indexOf('sudo install'))
    expect(result.unit).toContain(`WorkingDirectory=${result.root}`)
    expect(result.unit).toContain(`ExecStart=${result.root}/bin/node ${result.root}/server/index.mjs`)
    expect(result.unit).toContain('User=ubuntu')
    expect(result.unit).toContain('Environment=PORT=80')
    expect(result.unit).toContain('AmbientCapabilities=CAP_NET_BIND_SERVICE')
    expect(result.unit).toContain('Restart=always')
    expect(result.calls).toContain('sudo systemctl enable smallgame.service')
    expect(result.calls).toContain('http://127.0.0.1/ -o /dev/null')
    expect(result.calls).toContain('http://127.0.0.1/api/farm/leaderboard')
    expect(result.stdout).toContain('检查通过')
  }, 30000)
  it('leaves service configuration and process untouched when update tests fail', () => {
    const result = runService('update', 'test-fails')
    expect(result.status).not.toBe(0)
    expect(result.calls).toContain('npm test')
    expect(result.unit).toBe('')
    expect(result.calls).not.toContain('npm run build')
    expect(result.calls).not.toContain('sudo systemctl restart')
  }, 30000)
  it('refuses an occupied port before installing dependencies or changing services', () => {
    const result = runService('install', 'busy')
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('80 端口已被其他进程占用')
    expect(result.calls).not.toContain('npm ci')
    expect(result.unit).toBe('')
  }, 30000)
  it('reports health-check failures with logs instead of claiming a successful deployment', () => {
    const result = runService('install', 'unhealthy')
    expect(result.status).not.toBe(0)
    expect(result.calls).toContain('sudo journalctl -u smallgame.service -n 60 --no-pager')
    expect(result.stdout).not.toContain('检查通过')
    expect(result.stderr).toContain('启动或 HTTP 检查失败')
  }, 30000)
  it('stops successfully without rebuilding or restarting the service', () => {
    const result = runService('stop')
    expect(result.status).toBe(0)
    expect(result.calls).toBe('sudo systemctl stop smallgame.service\n')
    expect(result.stdout).toContain('已停止')
  }, 30000)
})

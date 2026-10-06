import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

// Execute the actual Bash workflow against isolated command doubles. Nothing
// touches /etc, invokes real sudo, opens ports or changes the host services.
function runService(action = 'install', mode = '', supervisor = 'systemd') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'smallgame-service-')))
  const bin = join(root, 'bin'), log = join(root, 'calls')
  for (const folder of ['bin', 'scripts', 'server']) mkdirSync(join(root, folder))
  copyFileSync(new URL('./game-service.sh', import.meta.url), join(root, 'scripts/game-service.sh'))
  copyFileSync(new URL('./game-service-daemon.sh', import.meta.url), join(root, 'scripts/game-service-daemon.sh'))
  writeFileSync(join(root, 'package-lock.json'), '{}')
  writeFileSync(join(root, 'server/index.mjs'), '')
  writeFileSync(join(root, 'hold'), '')
  if (['start', 'restart'].includes(action)) {
    mkdirSync(join(root, 'dist/client'), { recursive: true })
    writeFileSync(join(root, 'dist/client/index.html'), '<html></html>')
  }
  writeFileSync(log, '')
  const command = (name, script) => writeFileSync(join(bin, name), '#!/bin/bash\nset -eu\n' + script, { mode: 0o755 })
  command('uname', 'echo Linux\n')
  command('id', 'if [[ "$1" == -u ]]; then echo 1000; else echo ubuntu; fi\n')
  // macOS readlink does not consistently provide -f; our fixture paths have no links.
  command('readlink', 'echo "$2"\n')
  // In daemon mode the watchdog expects a long-lived server process. Block on a
  // real command so the shortened `sleep` double cannot end it prematurely.
  command('node', 'case "$1" in *server/index.mjs) exec tail -f "$SERVICE_TEST_ROOT/hold" ;; esac\n')
  command('crontab', `printf 'crontab %s\\n' "$*" >> "$SERVICE_TEST_ROOT/calls"\ncat > "$SERVICE_TEST_ROOT/crontab"\n`)
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
      start|restart) touch "$SERVICE_TEST_ROOT/restarted" ;;
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
if [[ "$SERVICE_TEST_MODE" == unhealthy ]]; then exit 1; fi
if [[ "$SERVICE_TEST_MODE" == api-fails && "$*" == *api/farm/leaderboard* ]]; then exit 1; fi
`)
  command('sleep', '/bin/sleep 0.02\n')
  try {
    const result = spawnSync('bash', [join(root, 'scripts/game-service.sh'), action], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, SERVICE_TEST_ROOT: root, SERVICE_TEST_MODE: mode, GAME_SUPERVISOR: supervisor },
      encoding: 'utf8', timeout: 30000,
    })
    const runtime = join(root, '.service')
    const pidFile = (name) => join(runtime, name)
    const state = {
      runtime: existsSync(runtime),
      daemon: existsSync(pidFile('daemon.pid')) ? readFileSync(pidFile('daemon.pid'), 'utf8').trim() : '',
      server: existsSync(pidFile('server.pid')) ? readFileSync(pidFile('server.pid'), 'utf8').trim() : '',
    }
    // The watchdog and its server outlive this call; stop both before cleanup.
    for (const pid of [state.daemon, state.server]) {
      if (pid) { try { process.kill(Number(pid), 'SIGKILL') } catch { /* already gone */ } }
    }
    return { ...result, calls: readFileSync(log, 'utf8'), unit: existsSync(join(root, 'unit')) ? readFileSync(join(root, 'unit'), 'utf8') : '', root, state }
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
    expect(result.calls).toContain('http://127.0.0.1:80/ -o /dev/null')
    expect(result.calls).toContain('http://127.0.0.1:80/api/farm/leaderboard')
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
  it('falls back to the bundled watchdog on hosts without systemd', () => {
    const result = runService('install', '', 'daemon')
    expect(result.status, result.stderr + result.stdout).toBe(0)
    // Build still gates the deployment, but no unit file or systemctl is used.
    expect(result.calls).toContain('npm ci\nnpm test\nnpm run lint\nnpm run build\n')
    expect(result.unit).toBe('')
    expect(result.calls).not.toContain('sudo systemctl enable smallgame.service')
    expect(result.state.runtime).toBe(true)
    expect(result.state.daemon).not.toBe('')
    expect(result.state.server).not.toBe('')
    expect(result.stdout).toContain('自带常驻守护进程')
  }, 30000)
  it('returns failure for daemon status when no managed processes exist', () => {
    const result = runService('status', '', 'daemon')
    expect(result.status).not.toBe(0)
    expect(result.stdout).toContain('游戏服务：未运行')
    expect(result.stderr).toContain('服务状态检查失败')
  })
  it('does not report a successful daemon start when HTTP is unavailable', () => {
    const result = runService('start', 'unhealthy', 'daemon')
    expect(result.state.daemon).not.toBe('')
    expect(result.state.server).not.toBe('')
    expect(result.status).not.toBe(0)
    expect(result.calls).not.toContain('npm ci')
    expect(result.stderr).toContain('启动或 HTTP 检查失败')
  })
  it('requires the API as well as the homepage after systemd restart', () => {
    const result = runService('restart', 'api-fails')
    expect(result.status).not.toBe(0)
    expect(result.calls).toContain('sudo systemctl restart smallgame.service')
    expect(result.calls).toContain('http://127.0.0.1:80/api/farm/leaderboard')
    expect(result.calls).toContain('sudo journalctl -u smallgame.service')
  })
  it('checks both endpoints on successful start without rebuilding', () => {
    const result = runService('start')
    expect(result.status, result.stderr).toBe(0)
    expect(result.calls).not.toContain('npm ci')
    expect(result.stdout).toContain('首页和排行榜接口正常')
  })
  it('rejects an unknown supervisor instead of silently changing modes', () => {
    const result = runService('install', '', 'invalid')
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('GAME_SUPERVISOR 仅支持')
    expect(result.calls).toBe('')
  })
})

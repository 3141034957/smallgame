# 乐队账号与单账号单会话登录

## 使用方式

首次进入即可游客游玩，账号栏和单局结算提供注册/登录入口。账号为 3–32 位英文字母、数字或下划线，不区分大小写；密码为 8–128 位，支持大小写英文字母、数字、特殊字符和普通空格，也接受非控制 Unicode 字符。密码不做 trim 或大小写转换，不要求同时包含所有字符种类；确认密码必须完全相同。

同一账号只有一个有效会话。成功登录会立即使该账号之前的会话失效，密码输错不会踢掉当前会话；不同账号互不影响。同浏览器的多个标签页共享 Cookie，账号改变后会同步重新检查。页面每 15 秒、重新获得焦点和变为可见时检查会话；上榜接口立即拒绝无效会话。刷新可保持登录，会话绝对有效期为 7 天。退出登录由服务端删除当前会话，不只是隐藏页面。

注册新账号自动继承本机游客时期累计的全部金币、已拥有及当前选择的角色、永久强化、任务、成就、生涯、昵称、设置与最佳成绩。账号、游客快照及会话在同一数据库事务中创建，注册失败不会清掉游客记录，成功后保留当前结算页和游戏状态。游客快照另存本机备份，再开始独立的新游客存档，避免重复转移同一份金币。登录已有账号优先恢复云端，游客存档单独保留。切换账号和退出先卸载旧游戏，再切换存档作用域，避免迟到写入混到其他账号。

账号和会话保存在服务器 SQLite，重启后保留。游戏成长进度保存到服务器 SQLite，刷新或换设备登录可恢复。登录后的本机改动延迟 500 ms 合并上传，同一账号串行同步；断网时保留本机待同步标记，联网和页面恢复时重试。上传途中发生的新改动会在确认上一版后继续上传，旧版本不能覆盖更新的云端进度，重复请求可安全重试。发生冲突时可恢复云端，未上传的本机副本另行备份。 匿名旧排行榜记录保留，但客户端不能通过提交匿名 ID 认领它们。

## 接口与存储

| 接口                      | 用途                                                             |
| ------------------------- | ---------------------------------------------------------------- |
| `POST /api/auth/register` | `{ account, password, progress? }`，注册并继承游客快照           |
| `POST /api/auth/login`    | `{ account, password }`，替换旧会话                              |
| `GET /api/auth/session`   | 返回当前 `{ user: { id, username } }`，无 Cookie 时 `user: null` |
| `POST /api/auth/logout`   | 删除当前会话并清 Cookie                                          |

| `GET /api/progress` | 返回当前账号 `{ data, revision }` 成长快照 |
| `POST /api/progress` | `{ data, revision }`，按预期版本更新，版本冲突返回 409 |

写请求必须使用 JSON 和 `X-Echo-Request: 1`。页面携带 `X-Echo-User` 防止旧标签页将对局写到新登录的账号。服务不开放跨域 CORS；前后端通过同一 IP 和端口提供，接口使用相对 `/api` 路径。账号令牌只存于 `HttpOnly; SameSite=Lax; Path=/` Cookie，不放在 localStorage、URL 或 JSON 响应。生产通过 HTTPS 提供服务时设置 `AUTH_COOKIE_SECURE=1`；当前 HTTP/IP 访问可运行，但 HTTP 本身不加密密码传输。

`accounts` 只存随机账号 ID、规范化账号名、随机盐的 scrypt 哈希和创建时间；`account_sessions` 每个账号只留一条 SHA-256 令牌摘要与到期时间。scrypt 使用 `N=32768, r=8, p=3`、16 字节随机盐、32 字节派生值和 64 MiB 内存上限，异步执行且最多两次同时派生。未知账号也执行相同成本校验，比较使用 timingSafeEqual。

服务器连接 IP 每 15 分钟最多 30 次登录/注册请求；同账号每 15 分钟最多 10 次密码尝试，成功后清除该账号计数。计数保存在 SQLite，重启不能绕过。IP 使用 socket 地址，不信任客户端提供的 X-Forwarded-For；若后续加反向代理，应另行配置可信代理身份，否则共享代理出口也会共享限额。登录请求体上限 16 KiB，注册和进度快照最多 256 KiB 另加协议字段开销，过大、异常输入和服务忙碌都返回可见错误。

上榜仍由共享规则重放验证；身份改由会话提供，忽略伪造的客户端 playerId，收完回放后再检查会话，防止上传期间被踢下线仍成功上榜。公开榜可未登录查看，但个人名次只根据当前会话返回。成长快照只接受游戏存档键，不含密码或令牌；服务器提供保存与版本保护，快照本身仍由客户端产生，并非服务端金币账本。

## 实现与验证

- `server/auth-store.mjs`：账户、密码哈希、会话、限流和账号成长事务。
- `server/auth.mjs`：Cookie、请求校验和认证 HTTP 接口。
- `src/features/auth/`：登录界面、会话检查、请求和共享输入规则。
- `src/utils/accountStorage.ts`：游客与账号存档作用域、旧版迁移和云端版本。

测试覆盖特殊字符、密码空格与大小写、长度边界、盐与令牌摘要、重复/并发注册、会话替换与过期、重启保留、旧会话退出不影响新登录、CSRF 写请求保护、请求限额、体积限制、伪造玩家 ID、存档隔离、失败写入、重复提交、断网重连与页面卸载。浏览器通过本机 `127.0.0.1` 实测登录与刷新。

密码参数参考 [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)；异步派生与比较 API 参考 [Node.js crypto](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)。Cookie 处理参考 [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)。

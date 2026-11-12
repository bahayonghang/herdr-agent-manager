# 安装、升级和回退

先启动 Herdr，确认配置目录已生成，以及 `node --version` / `herdr-app --version` 可执行。Node 20.6+ 只用于开发与安装。Windows 环境变量覆盖需要目标机 PowerShell 7.3+；不使用覆盖时沿用 Herdr 原本的启动方式。

```powershell
npm run check
npm run install:mod
```

无需 npm install；没有第三方 npm 包或安装网络下载。默认 Herdr home 为 `$HOME/.config/herdr-app`，或 `$env:HERDR_APP_HOME`。

## 文件改动

创建 `mods/agent-manager/`、`mods/agent-manager-menu/`、从现有官方 tabs 复制的 `mods/agent-manager-tabs/`、来源布局副本 `layouts/agent-manager.json`、带 SHA-256 所有权记录的 `agent-manager-install.json`。

不修改官方 tabs/new-menu、来源布局、keys.json 或 settings.json。三个 Mod 都通过 `herdr-app check` 后才自动切换；失败恢复本次文件改动。check 仅覆盖初始渲染，不替代真实交互验收。

安装器不安装 Agent、不操作登录凭据、不访问网络。Mod 会在用户选择启动或 Check CLI 时执行程序，导入/导出访问指定文件，注册自定义 Agent 时合并写入 programs.json。

## 参数

```powershell
npm run install:mod -- --layout my-layout
npm run install:mod -- --home 'D:\HerdrHome'
npm run install:mod -- --herdr 'C:\Tools\Herdr\herdr-app.exe'
npm run install:mod -- --no-activate
```

`--layout` 指来源布局文件名（不含 .json），必须含官方 tabs。`--home` 也通过 HERDR_APP_HOME 传给子进程。`--no-activate` 仍检查，但不切换布局。

开发诊断可用 `--no-check`，这同时禁止自动启用；不要把它作为忽略错误的常规修复。之后手动检查：

```powershell
$h = if ($env:HERDR_APP_HOME) { $env:HERDR_APP_HOME } else { Join-Path $HOME '.config/herdr-app' }
herdr-app check (Join-Path $h 'mods/agent-manager')
herdr-app check (Join-Path $h 'mods/agent-manager-menu')
herdr-app check (Join-Path $h 'mods/agent-manager-tabs')
herdr-app do layout.switch --name agent-manager
```

## 配置与手工接入

+ → Manage… 打开面板。按主机管理入口，拖动柄或 ↑/↓ 排序。权限按钮循环切换，不支持的权限明确禁用启动。菜单 1–9 对应可启动列表，Enter 默认项，Shift+快捷键预览，预设可加单字母快捷键。它们只在菜单聚焦时生效。

Windows 路径按 JSON 转义，例如 `["C:\\Tools\\agent.exe"]`；空命令继承检测到的 run。环境变量是 JSON 对象，不插值 shell 表达式。Unix 环境覆盖需要实际 env 和可执行程序；Windows NoProfile 不加载个人 shell 函数。

布局使用自定义 tabs，或上游 tabs 代码结构改变时，自动安装器会拒绝猜测。可先检查无同名目录，再复制仓库的两个 mods 文件夹，在自己的 tabs 中明确接入：

```js
openOverlay({ mod: "agent-manager-menu", kind: "popup", width: 370, height: 570 });
```

手动安装需自己运行原生检查；没有安装清单的已有目录不会被自动接管。只打开管理面板而保留原菜单时，原菜单不会读取本项目偏好。

## 升级与卸载

```powershell
git pull --ff-only
npm run check
npm run install:mod
npm run uninstall:mod
```

升级拒绝覆盖手动修改或无所有权文件。先备份、合并源码并 build。Herdr 更新后可重新安装，从新版 tabs 生成集成副本。

卸载先切回来源布局，只删除未修改的拥有文件。保留偏好、备份、自定义 programs 注册和手动改动。Herdr 不可用时 `npm run uninstall:mod -- --no-activate` 只清理文件，之后手动选择来源布局。

安装锁 `.agent-manager-install.lock` 只有在确认没有正在运行的安装器时才可手动移除；普通失败自动释放。programs.json 的原文备份为 `agent-manager-programs-<timestamp>.json`。导入前偏好可通过 Restore backup 恢复；损坏共享配置的恢复按钮也先保存原始数据。不要删除整个 shared.json。

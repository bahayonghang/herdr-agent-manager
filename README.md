# Herdr Agent Manager

A native agent launcher and configuration manager for Herdr.

为 Herdr 新建 Agent 菜单提供可视化管理：**排序、启用/禁用、默认 Agent、YOLO 权限、启动预设、多主机设置**。使用 Herdr 原生 JavaScript / GPUI，不依赖 Electron、浏览器或额外服务。

> 包含完整源码、可安装 Mod、安装器与测试。Node 测试不等于原生 GUI 验收；开发环境没有 `herdr-app`。安装器会在你的机器上执行原生检查，通过后才启用。详见 [验证记录](docs/VALIDATION.md)。

## 已实现功能

| 区域 | 内容 |
| --- | --- |
| Agent 管理 | 检测、搜索、分类、启用/禁用、拖动或按钮排序 |
| 默认设置 | 每个主机的默认项、Space 默认覆盖、不可用项回退 |
| 权限管理 | 全局 → 主机 → 预设 → 单入口覆盖，CLI native / Ask / Auto / YOLO |
| 启动预设 | 新建、编辑、复制、删除；命令、参数、模型、环境变量、快捷键 |
| 菜单集成 | 替换 + 菜单，数字 1–9、Enter 默认项、Shift+快捷键预览；保留 Terminal / Space / Worktree |
| 多主机 | 本机和 SSH 主机配置隔离，固定目标 Space / 主机 / 目录，离线处理 |
| 自定义 Agent | 合并注册到 programs.json，保留原文备份和外部修改冲突检查 |
| 配置恢复 | 导入校验、导出移除环境变量值、备份恢复、主机重置 |
| 安全保护 | 高权限二次确认、过期预览拒绝、显式 CLI 检查、冲突参数处理 |
| 安装维护 | 原生检查、失败回滚、升级所有权校验、保守卸载，原版 Mods 和按键保持不变 |

Claude Code、Codex、Grok、GitHub Copilot 有独立权限适配器。其他 Agent 支持原生设置和自定义参数；不会为未知 CLI 虚构 `--yolo`。详见 [兼容性](docs/COMPATIBILITY.md)。

## 安装（Windows PowerShell）

先启动一次 Herdr。需要 Git、Node.js **20.6+**，以及 PATH 中的 `herdr-app`。Mod 运行时不需要 Node；只有 Windows 环境变量覆盖需要目标机的 **PowerShell 7.3+ (`pwsh`)**。

```powershell
git clone https://github.com/bahayonghang/herdr-agent-manager.git
cd herdr-agent-manager
npm run check
npm run install:mod
```

**没有 npm 依赖，不需要 `npm install`。** 安装器从本机的官方 tabs 和 main 布局创建独立副本，检查成功后切换到 `agent-manager` 布局。

点击 **+ → Manage…** 打开面板，或直接执行：

```powershell
herdr-app do mod.open --name agent-manager
```

已有自定义布局：`npm run install:mod -- --layout my-layout`。完整参数和手动接入见 [INSTALL.md](INSTALL.md)。

## 使用边界

**CLI native 不等于安全模式**：它保留已有参数和 CLI 自身设置，包括用户已经开启的高权限。更改只影响通过本 Mod 启动的新会话，不改变运行中会话、CLI 全局设置或其他 Mod 的启动行为。

参数填写为 JSON 数组，例如 `["--verbose"]`，完整命令例如 `["C:\\Tools\\agent.exe"]`。环境变量填写 JSON 对象；保存在本地 shared.json，**没有加密**。不要填 API 密钥。导出移除环境变量，但任意参数和路径仍可能包含敏感信息。

Check CLI 仅在点击后运行选定主机上程序的 `--version` / `--help`；帮助文本检查不保证全部版本语义一致。Herdr 安装检测可能缓存一分钟。本 Mod 不注入官方 Settings 分类，不实现 Orca Chat 协议、不接管全局终端快捷键、不做跨客户端云同步。

## 开发和卸载

```powershell
npm run build           # src → 两个可安装 Mod
npm run check           # 生成文件一致性 + 全部 Node 测试
npm run uninstall:mod   # 切回来源布局，保留用户修改和配置
```

`src/` 是唯一源码，不单独修改 `mods/`。CI 配置覆盖 Linux/Windows/macOS × Node 20/22，但没有原生 Herdr GUI。修改后仍需原生检查和交互测试。

参见 [架构](docs/ARCHITECTURE.md)、[贡献约定](AGENTS.md)、[实现配方](RECIPE.md)。MIT License；安装器只在用户电脑上复制其现有 tabs，不在仓库分发上游代码。

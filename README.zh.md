# Platinum

[中文](README.zh.md) | [English](README.md)

### 构建工具

-   [NodeJS 16.x-18.x](https://nodejs.org)
-   [pnpm 包管理器](https://pnpm.io)
-   [Advanced Installer 20.2](https://advancedinstaller.com)

> ⚠️ Advanced Installer 是一个**商业软件**。如果你需要构建 UWP 安装包请安装此工具。

**下文的所有命令都是在本 repo 下的 `Platinum` 文件夹下执行的。**

### 安装依赖

```powershell
pnpm install
```

### 调试

```powershell
# 你可以添加参数 `--enable-browser-logging --dev` 来记录日志和调试代码
pnpm dev
```

### 构建

```powershell
pnpm build
# 构建 UWP 安装包
# pnpm build:uwp
```

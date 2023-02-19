# Platinum

[中文](README.zh.md) | [English](README.md)

### Build tools

-   [NodeJS 16.x-18.x](https://nodejs.org)
-   [pnpm package manager](https://pnpm.io)
-   [Advanced Installer 20.2](https://advancedinstaller.com)

> ⚠️ Advanced Installer is a **commercial** software. Only required if you want to build UWP package on Windows.

**All of the commands are executed under `Platinum` folder!**

### Installing dependencies

```powershell
pnpm install
```

### Debugging

```powershell
# You can also add `--enable-browser-logging --dev` for inspecting
pnpm dev
```

### Building

```powershell
pnpm build
# Build UWP package
# pnpm build:uwp
```

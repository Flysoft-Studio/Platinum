# Platinum

本项目处于非活跃状态。
此说明文件仅供参考。
也可参考`编译构建调试指南.rtf`。

### 构建工具 (安装方法)

-   NodeJS 16 ([https://nodejs.org](https://nodejs.org))
-   TypeScript compiler (运行 npm i tsc -g)
-   Docker for Windows (可选，如需要在 Windows 上构建 Linux 版需要此工具，需要把 package.json 后面的 c3e320779ef856d314f6443933aaa836000b0b7da4819d91a700692649f244bc 改成自己的容器 id，暂时不提供支持)
-   Advanced Installer 19.1 (可选，如需要在 Windows 上构建 UWP 版需要此工具，需要把 package.json 后面的 c3e320779ef856d314f6443933aaa836000b0b7da4819d91a700692649f244bc 改成自己的容器 id，暂时不提供支持)

### 安装依赖

请在 Platinum 目录下执行

```powershell
npm i
```

### 调试

请在 Platinum 目录下执行

```powershell
npx electron .
```

### 构建

请在 Platinum 目录下执行

```powershell
npm run compile:win&&npm run build:win
```

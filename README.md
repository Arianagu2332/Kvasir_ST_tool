# Kvasir ST Tool

Kvasir 是一个用于 SillyTavern 的酒馆助手脚本，提供 AU 世界观库、IF 线库、番外小剧场库、人设补充包生成和当前聊天注入。

## 安装

导入项目根目录的 `Kvasir-安装脚本.json`。脚本入口会从 GitHub jsDelivr 加载 `dist/Kvasir/index.js`。

## 故事库更新

故事库位于 `library/library.json`，版本清单位于 `library/manifest.json`。使用 `tools/library-editor.html` 编辑库，导出两个 JSON 文件并替换 `library` 文件夹中的文件，然后运行 `tools/发布库更新.ps1`。

库更新只提交故事库文件，不会重新安装脚本。用户端打开 Kvasir 或点击“检查库更新”即可同步。

## 脚本开发

```text
pnpm install
pnpm build
```

脚本源代码位于 `src/Kvasir`。代码变更推送到 `main` 后，GitHub Actions 会重新生成 `dist`。

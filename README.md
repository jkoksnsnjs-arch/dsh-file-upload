
<img width="1280" height="720" alt="dsh-upload-composer" src="https://github.com/user-attachments/assets/b80ee51a-8308-44b6-bcc8-17ec3f00bada" />

















# dsh-file-upload

> Codex-style file upload for DeepSeek Harness.
> 为 DeepSeek Harness 提供 Codex 风格的文件上传体验。

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）Web 客户端提供类似 Codex 的完整文件上传体验：输入框回形针上传、粘贴/拖拽上传、文件卡片、路径自动写入开关、文件管理面板，以及自动清理（数量上限 + 定时删除）。

## 功能

- 输入框内新增回形针上传按钮，支持一次选择多个文件。
- 支持粘贴、拖拽文档文件，上传后显示文件卡片（类型、名称、大小、状态、重试、移除）。
- 上传成功后自动把文件地址写进输入框，可在“文件管理”面板中关闭该行为。
- “文件管理”面板：查看当前会话已上传文件，按需删除，并展示自动清理规则。
- 自动清理：每个会话最多保留 50 个文件，超过 30 天的文件自动删除，每 6 小时检查一次，上传后也会立即清理。
- `read_document` 工具可读取 PDF、Word、Excel、PowerPoint、OpenDocument、EPUB、文本等格式。

## 目录结构

```text
plugins/
  dsh-paste-files/        客户端插件：上传按钮、文件卡片、管理面板
  dsh-document-reader/    服务端插件：上传/列表/删除 API、定时清理、read_document
tests/                    轻量冒烟测试
docs/screenshots/         界面截图
```

## 安装

1. 将 `plugins/dsh-paste-files` 与 `plugins/dsh-document-reader` 复制到 dsh profile 的插件目录，例如 `~/.dsh/profiles/web/plugins/`。
2. 在 profile 的 `package.json` 中按现有插件方式加入依赖，例如：

```json
{
  "dependencies": {
    "@local/dsh-paste-files": "link:plugins\\dsh-paste-files",
    "@local/dsh-document-reader": "link:plugins\\dsh-document-reader"
  }
}
```

3. 重启 dsh web 服务并刷新页面。

## 配置

`dsh-document-reader` 支持以下配置项（通过插件配置传入）：

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `pythonPath` | 自动探测 | 文档提取使用的 Python 解释器 |
| `maxChars` | `200000` | 单次读取最大字符数 |
| `timeoutMs` | `120000` | 文档提取超时 |
| `retentionDays` | `30` | 超过该天数的文件自动删除 |
| `maxFilesPerSession` | `50` | 每个会话最多保留文件数 |
| `cleanupIntervalHours` | `6` | 定时清理间隔 |

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/upload-document` | 上传文件（JSON：`sessionId`、`name`、`data` base64） |
| `GET` | `/api/upload-files?sessionId=...` | 列出会话已上传文件 |
| `DELETE` | `/api/upload-files?sessionId=...&name=...` | 删除指定文件 |

## 测试

```bash
node tests/upload-route.test.mjs
node tests/read-document.test.mjs
```

测试脚本依赖 dsh 运行时的 `@deepseek-ai` 包，请在已安装 dsh profile 依赖的环境中运行。

## 许可证

[MIT](LICENSE)

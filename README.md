# Claude Code Proxy (iFlow Specialized)

[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/graviton711/claude_code_proxy.svg?style=social)](https://github.com/graviton711/claude_code_proxy/stargazers)
[![iFlow Optimized](https://img.shields.io/badge/Optimization-iFlow.cn-cyan.svg)](#features)

A high-performance bridge specifically optimized for iFlow.cn, enabling Claude Code CLI to work seamlessly with OpenAI-compatible APIs while bypassing strict concurrency and initialization constraints.

## Overview

Claude Code Proxy acts as a translation layer between the Anthropic Claude API format used by the Claude Code CLI and OpenAI-compatible providers. It is specifically tuned for iFlow.cn to handle parallel initialization issues and thinking/reasoning model mapping.

## Features

- iFlow.cn Specialized Staggering: Built-in 0.5s delay between request starts to eliminate 434 (Invalid apiKey) and 429 (Rate limit) errors.
- Thinking Support: Full integration for reasoning models (o1/o3), mapping Claude thinking blocks to OpenAI reasoning effort.
- Multimodal Handling: Optimized Base64 image processing with Lazy Deepcopy for minimal memory overhead.
- Real-time Streaming: Fluid experience for both text and tool calls (incremental input_json_delta delivery).
- Error Handling: Graceful conversion of non-SSE JSON errors into Claude-compatible events.

## Installation

The fastest way to install and configure the proxy is using npx directly from GitHub.

```bash
npx github:graviton711/claude_code_proxy
```

*Note: Once published to npm, you will be able to use `npx @graviton711/claude-code-proxy`.*

This command will start an interactive setup wizard that:
1. Deploys necessary files to your target directory.
2. Guides you through API key and model configuration.
3. Sets up your .env file automatically.
4. Optionally integrates a "claude" command into your PowerShell profile (Windows).

### Manual Installation

If you prefer a manual setup:

1. Clone the repository:
   ```bash
   git clone https://github.com/graviton711/claude_code_proxy.git
   cd claude_code_proxy
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Configure .env based on .env.example.

## Usage

### 1. Start the Proxy

If you used the npx installer on Windows, you can simply type `claude` in a new terminal.

Otherwise, start the proxy server:
```bash
python start_proxy.py
```

### 2. Run Claude Code

Configure the Base URL and run the CLI:

Windows (PowerShell):
```powershell
$env:ANTHROPIC_BASE_URL="http://localhost:8082"; $env:ANTHROPIC_API_KEY="any"; npx @anthropic-ai/claude-code
```

Linux / macOS:
```bash
ANTHROPIC_BASE_URL=http://localhost:8082 ANTHROPIC_API_KEY=any npx @anthropic-ai/claude-code
```

## Configuration

The proxy is configured via environment variables or a .env file.

| Variable | Default | Description |
|----------|---------|-------------|
| OPENAI_BASE_URL | https://api.openai.com/v1 | Set to https://apis.iflow.cn/v1 for iFlow |
| OPENAI_API_KEY | None | Your backend API key |
| ANTHROPIC_API_KEY | None | (Optional) Key for client-side validation |
| IFLOW_STAGGER_DELAY | 0.5 | Delay in seconds between initialization |
| MAX_TOKENS_LIMIT | 4096 | Output token safety cap |
| REQUEST_TIMEOUT | 90 | API connection timeout |

## License

MIT License. Free for all developers.

Developed for the iFlow and Claude community.

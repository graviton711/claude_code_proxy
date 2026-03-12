# Claude Code x iFlow Proxy

![](https://img.shields.io/badge/Node.js-18%2B-brightgreen?style=flat-square) ![](https://img.shields.io/badge/Python-3.10%2B-blue?style=flat-square)

**Claude Code x iFlow Proxy** is a specialized orchestrator designed to connect **Claude Code** CLI directly with the **iFlow** provider (apis.iflow.cn). It provides a seamless bridge by converting Claude API requests to OpenAI-compatible calls, with full support for core iFlow features like *Thinking Process* and *Reasoning tokens*.

This tool acts as a professional Orchestrator: managing the proxy backend lifecycle, automating environment variables, and delivering a premium terminal experience.

## Get started

> [!IMPORTANT]
> This tool requires both **Node.js** and **Python** installed on your system.

### Method 1: Global Installation (Recommended)

Install the CLI manager globally to use the `claude-proxy` command anywhere:

```bash
npm install -g graviton711/claude_code_proxy
```

### Method 2: Run-on-the-fly (NPX)

Run the orchestrator without permanent installation:

```bash
npx github:graviton711/claude_code_proxy
```

### Method 3: Manual Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/graviton711/claude_code_proxy.git
   cd claude_code_proxy
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   npm install
   ```

## Usage

Once installed, simply run the orchestrator in any project directory:

```bash
claude-proxy
```

The automated workflow includes:
1. **Selection**: Guides you through a one-time setup if `.env` (iFlow API Key, Model...) is missing.
2. **Boot**: Automatically spins up the Python proxy optimized for iFlow.
3. **Connect**: Launches the official Claude Code CLI with pre-configured environment variables.
4. **Cleanup**: Gracefully shuts down the proxy and releases ports when you exit Claude.

## Key Features

- **iFlow Optimized**: First-class support for `apis.iflow.cn`, including specialized handling for reasoning/thinking models.
- **Premium UI**: Box-drawing aesthetics and color-coded logging inspired by high-end developer tools.
- **Non-Invasive**: Zero changes to your system `PATH` or Shell Profiles.
- **Smart Lifecycle**: Fully managed proxy startup and shutdown synchronized with your Claude session.

---

*Note: This is an unofficial proxy manager for @anthropic-ai/claude-code, specifically tailored for the iFlow ecosystem.*

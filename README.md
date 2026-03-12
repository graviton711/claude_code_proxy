```text
   ______ _                       _        _____                             
  / ____/| |                     | |      |  __ \                            
 | |     | |  __ _  _   _   ____ | |  ___ | |__) | _ __  ___ __  __ _   _  
 | |     | | / _` || | | | / _` || | / _ \|  ___/ | '__|/ _ \\ \/ /| | | | 
 | |____ | || (_| || |_| || (_| || ||  __/| |     | |  | (_) | >  < | |_| | 
  \_____/|_| \__,_| \__,_| \__,_||_| \___||_|     |_|   \___/ /_/\_\ \__, | 
                                                                      __/ | 
                                                                     |___/  
```

# Claude Code Proxy (Production Ready)

[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-Automated-blue.svg)](#docker-automation)
[![Thinking API](https://img.shields.io/badge/API-Thinking-orange.svg)](#thinking-and-reasoning)

A high-performance bridge that empowers **Claude Code CLI** to interact with any **OpenAI-compatible API** provider. Seamlessly translate Claude's unique features into Universal AI capabilities.

---

## 🔥 Key Features

- **🧠 Thinking / Reasoning (o1/o3 support)**: Automatically maps Claude's `thinking` parameters to OpenAI's `reasoning_effort`.
- **🌐 iFlow.cn Optimized**: Built-in **Staggered Initiation** delay (0.5s) to satisfy iFlow's strict concurrency limits and prevent 429/434 errors.
- **⚡ High Performance**: 
  - **Lazy Deepcopy**: Optimized memory usage for massive vision/image requests.
  - **Real-time Streaming**: Instant delivery of text and incremental tool call deltas.
- **🐳 Docker Automation**: Integrated Windows PowerShell logic to automatically launch Docker Desktop before execution.
- **🎨 Premium UI**: Rich terminal interface with ASCII banners and formatted tables for clear status monitoring.

---

## 🚀 Installation & Usage

### ⚙️ Prerequisites
- Python 3.9+
- Docker Desktop (for full automation features)

### 📦 Setup
```bash
# Clone the repository
git clone https://github.com/graviton711/claude_code_proxy.git
cd claude_code_proxy

# Install dependencies
pip install -r requirements.txt
```

### 🛠️ Configuration
Rename `.env.example` to `.env` and fill in your details:
```ini
OPENAI_API_KEY="sk-..."
OPENAI_BASE_URL="https://api.openai.com/v1"
BIG_MODEL="gpt-4o"
SMALL_MODEL="gpt-4o-mini"
```

### 🎌 Execution
1. **Start the Proxy**: `python src/main.py`
2. **Launch Claude Code**:
   ```bash
   ANTHROPIC_BASE_URL=http://localhost:8082 ANTHROPIC_API_KEY=any-value claude
   ```

---

## 🛠️ Windows PowerShell Integration
To make the experience truly seamless, follow our [QUICKSTART.md](QUICKSTART.md) to integrate the **Automated Start** script into your PowerShell profile. This enables:
- **Auto-Docker check** (Starts Docker if it's off)
- **One-command launch** (`claude` starts everything)
- **Auto-shutdown** on exit

---

## 📊 Environment Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Binding address |
| `PORT` | `8082` | Listening port |
| `IFLOW_STAGGER_DELAY`| `0.5` | Delay between request initiations |
| `MAX_TOKENS_LIMIT` | `4096` | Output token cap |
| `REQUEST_TIMEOUT` | `90` | API Timeout in seconds |

---

## 🛡️ License
Released under the **MIT License**. Feel free to use and contribute!

---
*Developed for the AI Power User community. 🚀*

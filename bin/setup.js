#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');
const readline = require('readline');

// ANSI Colors for zero-dependency styling
const colors = {
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
    bold: '\x1b[1m',
    reset: '\x1b[0m'
};

const pkgRoot = path.resolve(__dirname, '..');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query, defaultValue = '') => new Promise((resolve) => {
    const displayDefault = defaultValue ? ` (${defaultValue})` : '';
    rl.question(`${colors.white}${query}${colors.cyan}${displayDefault}: ${colors.reset}`, (answer) => {
        resolve(answer.trim() || defaultValue);
    });
});

const confirm = (query, defaultYes = true) => new Promise((resolve) => {
    const options = defaultYes ? '[Y/n]' : '[y/N]';
    rl.question(`${colors.white}${query} ${colors.gray}${options}: ${colors.reset}`, (answer) => {
        if (!answer) resolve(defaultYes);
        else resolve(answer.toLowerCase().startsWith('y'));
    });
});

const indent = '  ';

function drawSetupHeader() {
    const pkg = require(path.join(pkgRoot, 'package.json'));
    const versionStr = `v${pkg.version} Orchestrator`;
    const boxWidth = 42;
    const padding = Math.max(0, boxWidth - versionStr.length);
    const leftPad = ' '.repeat(Math.floor(padding / 2));
    const rightPad = ' '.repeat(Math.ceil(padding / 2));

    console.log(`\n${colors.magenta}${colors.bold}   ╭──────────────────────────────────────────╮${colors.reset}`);
    console.log(`${colors.magenta}${colors.bold}   │${colors.reset}                                          ${colors.magenta}${colors.bold}│${colors.reset}`);
    console.log(`${colors.magenta}${colors.bold}   │${colors.reset}       ${colors.white}${colors.bold}CLAUDE-TO-IFLOW PROXY SETUP${colors.reset}        ${colors.magenta}${colors.bold}│${colors.reset}`);
    console.log(`${colors.magenta}${colors.bold}   │${colors.reset}${leftPad}${colors.dim}${versionStr}${colors.reset}${rightPad}${colors.magenta}${colors.bold}│${colors.reset}`);
    console.log(`${colors.magenta}${colors.bold}   │${colors.reset}                                          ${colors.magenta}${colors.bold}│${colors.reset}`);
    console.log(`${colors.magenta}${colors.bold}   ╰──────────────────────────────────────────╯${colors.reset}\n`);
    console.log(`${colors.gray}${indent}This wizard will deploy and configure the iFlow proxy engine.\n${colors.reset}`);
}

async function main() {
    process.stdout.write(' Initializing Orchestrator...\r');
    
    drawSetupHeader();

    // 1. Choose Installation Mode
    console.log(`${colors.white}Where do you want to install the proxy?${colors.reset}`);
    console.log(`  1) ${colors.cyan}Current folder${colors.reset} (${process.cwd()})`);
    console.log(`  2) ${colors.cyan}Default folder${colors.reset} (${path.join(os.homedir(), 'claude-proxy')})`);
    console.log(`  3) ${colors.cyan}Custom path${colors.reset}`);

    const choice = await question('Select an option [1/2/3]', '2');

    let installDirRaw = '';
    if (choice === '1') {
        installDirRaw = process.cwd();
    } else if (choice === '3') {
        installDirRaw = await question('Enter custom installation path');
    } else {
        installDirRaw = path.join(os.homedir(), 'claude-proxy');
    }

    const installDir = path.resolve(installDirRaw.replace(/^~/, os.homedir()));

    // 2. Deploy Files
    console.log(`${colors.yellow}\n[FILES] Deploying files to ${installDir}...${colors.reset}`);
    if (!fs.existsSync(installDir)) {
        fs.mkdirSync(installDir, { recursive: true });
    }

    const filesToCopy = [
        'src',
        'requirements.txt',
        'pyproject.toml',
        'uv.lock',
        'start_proxy.py',
        'start_proxy_utf8.ps1',
        'docker-compose.yml',
        'Dockerfile',
        'README.md'
    ];

    function copyRecursiveSync(src, dest) {
        const stats = fs.statSync(src);
        if (stats.isDirectory()) {
            if (!fs.existsSync(dest)) fs.mkdirSync(dest);
            fs.readdirSync(src).forEach(child => {
                copyRecursiveSync(path.join(src, child), path.join(dest, child));
            });
        } else {
            fs.copyFileSync(src, dest);
        }
    }

    for (const file of filesToCopy) {
        const srcPath = path.join(pkgRoot, file);
        const destPath = path.join(installDir, file);
        if (fs.existsSync(srcPath)) {
            copyRecursiveSync(srcPath, destPath);
        }
    }
    console.log(`${colors.green}[DONE] Files deployed.${colors.reset}`);

    // 3. Configuration Wizard
    console.log(`${colors.cyan}\n[CONFIG] Configuring your proxy...${colors.reset}`);

    const OPENAI_API_KEY = await question('Enter your OpenAI-compatible API Key');
    if (!OPENAI_API_KEY) {
        console.log(`${colors.red}[ERROR] API Key is required. Exiting.${colors.reset}`);
        process.exit(1);
    }

    const OPENAI_BASE_URL = await question('Enter the API Base URL', 'https://apis.iflow.cn/v1');
    const MODEL = await question('Enter the Model name to use (e.g., kimi-k2-0905)', 'kimi-k2-0905');
    const enableSearxng = await confirm('Do you want to enable Searxng (Google Search for Claude)?', true);

    // 4. Generate .env file
    const envContent = `OPENAI_API_KEY=${OPENAI_API_KEY}
OPENAI_BASE_URL=${OPENAI_BASE_URL}
BIG_MODEL=${MODEL}
MIDDLE_MODEL=${MODEL}
SMALL_MODEL=${MODEL}
MAX_TOKENS=8096
REQUEST_TIMEOUT=600
IMAGE_ROUTING_ENABLED=true
IMAGE_ROUTING_MODE=handoff
VISION_HANDOFF_MAX_TOKENS=1800
LOG_LEVEL=INFO
`;

    fs.writeFileSync(path.join(installDir, '.env'), envContent);
    console.log(`${colors.green}[DONE] .env file created.${colors.reset}`);

    // 5. Install Python dependencies
    console.log(`${colors.yellow}\n[DEPS] Installing Python dependencies...${colors.reset}`);
    try {
        execSync('pip install -r requirements.txt', { cwd: installDir, stdio: 'inherit' });
        console.log(`${colors.green}[DONE] Python dependencies installed.${colors.reset}`);
    } catch (error) {
        console.log(`${colors.red}[WARN] Failed to install Python dependencies. Please run "pip install -r requirements.txt" manually later.${colors.reset}`);
    }

    // 6. Docker / Searxng Setup
    if (enableSearxng) {
        console.log(`${colors.yellow}\n[DOCKER] Setting up Searxng docker...${colors.reset}`);
        try {
            execSync('docker compose up -d', { cwd: installDir, stdio: 'inherit' });
            console.log(`${colors.green}[DONE] Searxng is running.${colors.reset}`);
        } catch (error) {
            console.log(`${colors.red}[WARN] Could not start Docker. Make sure Docker Desktop is running then run "docker compose up -d" in the install folder.${colors.reset}`);
        }
    }

    // 7. Claude CLI Check
    console.log(`${colors.yellow}\n[CLAUDE] Checking for Claude Code CLI...${colors.reset}`);
    try {
        execSync('claude --version', { stdio: 'ignore' });
        console.log(`${colors.green}[DONE] Claude Code CLI already installed.${colors.reset}`);
    } catch (error) {
        const installClaude = await confirm('Claude Code CLI not found. Do you want to install it? (Requires npm -g)', true);
        if (installClaude) {
            console.log(`${colors.yellow}[INSTALL] Installing @anthropic-ai/claude-code...${colors.reset}`);
            try {
                execSync('npm install -g @anthropic-ai/claude-code', { stdio: 'inherit' });
                console.log(`${colors.green}[DONE] Claude Code CLI installed.${colors.reset}`);
            } catch (err) {
                console.log(`${colors.red}[ERROR] Failed to install. Run "npm install -g @anthropic-ai/claude-code" manually.${colors.reset}`);
            }
        }
    }

    console.log(`\n ${colors.cyan}${colors.bold}🏁 Setup Complete!${colors.reset}`);
    console.log(`${indent}${colors.white}You can now use the proxy via ${colors.green}${colors.bold}claude-proxy${colors.reset} command.\n${colors.reset}`);
    console.log(`${indent}${colors.gray}Target installation folder: ${installDir}\n${colors.reset}`);

    rl.close();
}

function setupPowerShellProfile(installDir) {
    try {
        const profilePath = execSync('powershell -NoProfile -Command "$PROFILE"', { encoding: 'utf-8' }).trim();
        if (!profilePath) throw new Error('Could not find PowerShell profile path.');

        const profileDir = path.dirname(profilePath);
        if (!fs.existsSync(profileDir)) {
            fs.mkdirSync(profileDir, { recursive: true });
        }

        let currentProfile = '';
        if (fs.existsSync(profilePath)) {
            currentProfile = fs.readFileSync(profilePath, 'utf8');
            const backupPath = `${profilePath}.bak-${Date.now()}`;
            fs.writeFileSync(backupPath, currentProfile);
            console.log(`${colors.gray}[BACKUP] Created profile backup at: ${backupPath}${colors.reset}`);
        }

        const escapedInstallDir = installDir.replace(/\\/g, '\\\\');
        const startTag = '# --- Claude Code Proxy Configuration START ---';
        const endTag = '# --- Claude Code Proxy Configuration END ---';

        const injection = `
${startTag}
function Ensure-ClaudeProxy {
    param([int]$Port = 8082, [int]$StartupDelayMs = 2500)
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) { return Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue }
    $proxySrc = "${escapedInstallDir}"
    $proxyScript = Join-Path $proxySrc 'start_proxy_utf8.ps1'
    if (-not (Test-Path $proxyScript)) { Write-Error "Proxy script not found at $proxyScript"; return $null }
    $proxyProc = Start-Process powershell -WindowStyle Hidden -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $proxyScript) -PassThru
    Start-Sleep -Milliseconds $StartupDelayMs
    return $proxyProc
}

function Start-Claude {
    $env:ANTHROPIC_BASE_URL = 'http://localhost:8082'
    $env:ANTHROPIC_API_KEY = 'any-value'
    $proxyProc = Ensure-ClaudeProxy
    $claudeCmd = Get-Command claude -CommandType ExternalScript, Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $claudeCmd) { Write-Error 'Cannot find Claude CLI executable on PATH.'; return }
    try { & $claudeCmd.Source @args } finally {
        $port = 8082
        $l = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($l) { Stop-Process -Id $l.OwningProcess -Force -ErrorAction SilentlyContinue }
        if ($proxyProc) { Stop-Process -Id $proxyProc.Id -Force -ErrorAction SilentlyContinue }
    }
}
if (-not (Get-Alias claude -ErrorAction SilentlyContinue)) { Set-Alias claude Start-Claude -Force }
${endTag}
`;

        let updatedProfile = '';
        const regex = new RegExp(`${startTag}[\\s\\S]*?${endTag}`, 'g');

        if (currentProfile.match(regex)) {
            console.log(`${colors.cyan}[INFO] Existing configuration found. Updating paths...${colors.reset}`);
            updatedProfile = currentProfile.replace(regex, injection.trim());
        } else {
            updatedProfile = currentProfile + '\n' + injection;
        }

        fs.writeFileSync(profilePath, updatedProfile.trim() + '\n');
        console.log(`${colors.green}[DONE] PowerShell profile updated: ${profilePath}${colors.reset}`);
    } catch (error) {
        console.log(`${colors.red}[ERROR] Error updating PowerShell profile: ${error.message}${colors.reset}`);
    }
}

main().catch(err => {
    console.error(`${colors.red}Unexpected error:${colors.reset}`, err);
    rl.close();
});

#!/usr/bin/env node

const inquirer = require('inquirer');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// Current package directory (where the npx files are)
const pkgRoot = path.resolve(__dirname, '..');

async function main() {
    console.log(chalk.cyan.bold('\n🚀 Welcome to Claude-to-OpenAI API Proxy All-in-One Setup!\n'));
    console.log(chalk.gray('This wizard will deploy and configure the proxy on your machine.\n'));

    // 1. Ask for Installation Directory
    const { installDirRaw } = await inquirer.default.prompt([
        {
            type: 'input',
            name: 'installDirRaw',
            message: 'Where do you want to install the proxy?',
            default: path.join(os.homedir(), 'claude-proxy')
        }
    ]);

    const installDir = path.resolve(installDirRaw.replace(/^~/, os.homedir()));

    // 2. Deploy Files
    console.log(chalk.yellow(`\n📂 Deploying files to ${installDir}...`));
    await fs.ensureDir(installDir);

    const filesToCopy = [
        'src',
        'requirements.txt',
        'start_proxy.py',
        'start_proxy_utf8.ps1',
        'docker-compose.yml',
        'Dockerfile'
    ];

    for (const file of filesToCopy) {
        const srcPath = path.join(pkgRoot, file);
        const destPath = path.join(installDir, file);
        if (await fs.exists(srcPath)) {
            await fs.copy(srcPath, destPath);
        }
    }
    console.log(chalk.green('✅ Files deployed.'));

    // 3. Configuration Wizard
    console.log(chalk.cyan('\n⚙️  Configuring your proxy...'));
    const answers = await inquirer.default.prompt([
        {
            type: 'input',
            name: 'OPENAI_API_KEY',
            message: 'Enter your OpenAI-compatible API Key:',
            validate: input => input.length > 0 ? true : 'API Key cannot be empty.'
        },
        {
            type: 'input',
            name: 'OPENAI_BASE_URL',
            message: 'Enter the API Base URL:',
            default: 'https://apis.iflow.cn/v1'
        },
        {
            type: 'input',
            name: 'MODEL',
            message: 'Enter the Model name to use (e.g., kimi-k2-0905, gpt-4o):',
            default: 'kimi-k2-0905'
        },
        {
            type: 'confirm',
            name: 'enableSearxng',
            message: 'Do you want to enable Searxng (Google Search for Claude)?',
            default: true
        }
    ]);

    // 4. Generate .env file in target directory
    const envContent = `OPENAI_API_KEY=${answers.OPENAI_API_KEY}
OPENAI_BASE_URL=${answers.OPENAI_BASE_URL}
BIG_MODEL=${answers.MODEL}
MIDDLE_MODEL=${answers.MODEL}
SMALL_MODEL=${answers.MODEL}
MAX_TOKENS=8096
REQUEST_TIMEOUT=600
IMAGE_ROUTING_ENABLED=true
IMAGE_ROUTING_MODE=handoff
VISION_HANDOFF_MAX_TOKENS=1800
LOG_LEVEL=INFO
`;

    await fs.writeFile(path.join(installDir, '.env'), envContent);
    console.log(chalk.green('✅ .env file created.'));

    // 5. Install Python dependencies in target directory
    console.log(chalk.yellow('\n📦 Installing Python dependencies...'));
    try {
        execSync('pip install -r requirements.txt', { cwd: installDir, stdio: 'inherit' });
        console.log(chalk.green('✅ Python dependencies installed.'));
    } catch (error) {
        console.log(chalk.red('⚠️  Failed to install Python dependencies. Please run "pip install -r requirements.txt" manually later.'));
    }

    // 6. Docker / Searxng Setup
    if (answers.enableSearxng) {
        console.log(chalk.yellow('\n🐋 Setting up Searxng docker...'));
        try {
            execSync('docker compose up -d', { cwd: installDir, stdio: 'inherit' });
            console.log(chalk.green('✅ Searxng is running.'));
        } catch (error) {
            console.log(chalk.red('⚠️  Could not start Docker. Make sure Docker Desktop is running then run "docker compose up -d" in the install folder.'));
        }
    }

    // 7. Check for Claude CLI
    console.log(chalk.yellow('\n🤖 Checking for Claude Code CLI...'));
    try {
        execSync('claude --version', { stdio: 'ignore' });
        console.log(chalk.green('✅ Claude Code CLI already installed.'));
    } catch (error) {
        const { installClaude } = await inquirer.default.prompt([
            {
                type: 'confirm',
                name: 'installClaude',
                message: 'Claude Code CLI not found. Do you want to install it? (Requires npm -g)',
                default: true
            }
        ]);
        if (installClaude) {
            console.log(chalk.yellow('📦 Installing @anthropic-ai/claude-code...'));
            try {
                execSync('npm install -g @anthropic-ai/claude-code', { stdio: 'inherit' });
                console.log(chalk.green('✅ Claude Code CLI installed.'));
            } catch (err) {
                console.log(chalk.red('❌ Failed to install Claude CLI. Please run "npm install -g @anthropic-ai/claude-code" manually.'));
            }
        }
    }

    // 8. PowerShell Profile Integration (Windows only)
    if (os.platform() === 'win32') {
        const { updateProfile } = await inquirer.default.prompt([
            {
                type: 'confirm',
                name: 'updateProfile',
                message: 'Do you want to add the "claude" command to your PowerShell profile automatically?',
                default: true
            }
        ]);

        if (updateProfile) {
            setupPowerShellProfile(installDir);
        }
    }

    console.log(chalk.cyan.bold('\n✨ Setup Complete! ✨'));
    console.log(chalk.white('You can now use ') + chalk.green.bold('claude') + chalk.white(' command in your terminal.\n'));
    console.log(chalk.gray(`Target installation folder: ${installDir}\n`));
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
            // Create backup
            const backupPath = `${profilePath}.bak-${Date.now()}`;
            fs.writeFileSync(backupPath, currentProfile);
            console.log(chalk.gray(`📦 Created profile backup at: ${backupPath}`));
        }

        const escapedInstallDir = installDir.replace(/\\/g, '\\\\');
        const startTag = '# --- Claude Code Proxy Configuration START ---';
        const endTag = '# --- Claude Code Proxy Configuration END ---';
        
        const injection = `
${startTag}
function Ensure-ClaudeProxy {
    param([int]$Port = 8082, [int]$StartupDelayMs = 1800)
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
            console.log(chalk.blue('ℹ️  Existing configuration found. Updating with new paths...'));
            updatedProfile = currentProfile.replace(regex, injection.trim());
        } else {
            updatedProfile = currentProfile + '\n' + injection;
        }

        fs.writeFileSync(profilePath, updatedProfile.trim() + '\n');
        console.log(chalk.green(`✅ PowerShell profile updated at: ${profilePath}`));
        console.log(chalk.green(`✅ PowerShell profile updated at: ${profilePath}`));
    } catch (error) {
        console.log(chalk.red(`❌ Error updating PowerShell profile: ${error.message}`));
    }
}

main().catch(err => {
    console.error(chalk.red('Unexpected error:'), err);
});

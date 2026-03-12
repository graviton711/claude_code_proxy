#!/usr/bin/env node

/**
 * Claude-to-iFlow Proxy Setup Wizard
 * Premium interactive setup using @clack/prompts and ora.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const pkgRoot = path.resolve(__dirname, '..');

function getPythonCmd() {
    try {
        execSync('python3 --version', { stdio: 'ignore' });
        return 'python3';
    } catch {
        try {
            execSync('python --version', { stdio: 'ignore' });
            return 'python';
        } catch {
            return null;
        }
    }
}

function getPipCmd() {
    try {
        execSync('pip3 --version', { stdio: 'ignore' });
        return 'pip3';
    } catch {
        try {
            execSync('pip --version', { stdio: 'ignore' });
            return 'pip';
        } catch {
            return null;
        }
    }
}

function isDockerRunning() {
    try {
        execSync('docker info', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function copyRecursiveSync(src, dest) {
    const stats = fs.statSync(src);
    if (stats.isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(child => {
            copyRecursiveSync(path.join(src, child), path.join(dest, child));
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

async function main() {
    const clack = await import('@clack/prompts');
    const { default: ora } = await import('ora');
    const pc = require('picocolors');

    const pkg = require(path.join(pkgRoot, 'package.json'));
    const versionStr = `v${pkg.version}`;

    console.log('');
    clack.intro(pc.magenta(pc.bold(`  CLAUDE-TO-IFLOW PROXY SETUP  ${pc.dim(versionStr)}  `)));

    /* ──────────── Environment Checks ──────────── */
    const pythonCmd = getPythonCmd();
    const pipCmd = getPipCmd();

    if (!pythonCmd) {
        clack.log.error(pc.red('Python 3.8+ is required but was not found.'));
        clack.log.info('Install Python from https://python.org and ensure it is in your PATH.');
        clack.outro(pc.red('Setup aborted.'));
        process.exit(1);
    }

    const pyVer = execSync(`${pythonCmd} --version`, { encoding: 'utf-8' }).trim();
    clack.log.success(`${pyVer} ${pc.dim('detected')}`);

    /* ──────────── Installation Location ──────────── */
    const installChoice = await clack.select({
        message: 'Where do you want to install the proxy?',
        options: [
            { value: 'cwd', label: `Current folder`, hint: process.cwd() },
            { value: 'default', label: `Default folder`, hint: path.join(os.homedir(), 'claude-proxy') },
            { value: 'custom', label: 'Custom path' },
        ],
    });

    if (clack.isCancel(installChoice)) {
        clack.cancel('Setup cancelled.');
        process.exit(0);
    }

    let installDir;
    if (installChoice === 'cwd') {
        installDir = process.cwd();
    } else if (installChoice === 'custom') {
        const customPath = await clack.text({
            message: 'Enter your custom installation path:',
            validate: (val) => {
                if (!val) return 'Path cannot be empty.';
            },
        });
        if (clack.isCancel(customPath)) {
            clack.cancel('Setup cancelled.');
            process.exit(0);
        }
        installDir = path.resolve(customPath.replace(/^~/, os.homedir()));
    } else {
        installDir = path.join(os.homedir(), 'claude-proxy');
    }

    /* ──────────── Deploy Files ──────────── */
    const deploySpinner = ora({ text: 'Deploying proxy files...', color: 'cyan' }).start();

    if (!fs.existsSync(installDir)) {
        fs.mkdirSync(installDir, { recursive: true });
    }

    const filesToCopy = [
        'src', 'requirements.txt', 'pyproject.toml', 'uv.lock',
        'start_proxy.py', 'docker-compose.yml', 'Dockerfile', 'README.md'
    ];

    for (const file of filesToCopy) {
        const srcPath = path.join(pkgRoot, file);
        const destPath = path.join(installDir, file);
        if (fs.existsSync(srcPath)) {
            copyRecursiveSync(srcPath, destPath);
        }
    }
    deploySpinner.succeed('Proxy files deployed.');

    /* ──────────── Configuration ──────────── */
    clack.log.step(pc.cyan('Configuring your proxy...'));

    const apiKey = await clack.text({
        message: 'Enter your OpenAI-compatible API Key:',
        validate: (val) => {
            if (!val) return 'API Key is required.';
        },
    });
    if (clack.isCancel(apiKey)) { clack.cancel('Setup cancelled.'); process.exit(0); }

    const baseUrl = await clack.text({
        message: 'Enter the API Base URL:',
        initialValue: 'https://apis.iflow.cn/v1',
    });
    if (clack.isCancel(baseUrl)) { clack.cancel('Setup cancelled.'); process.exit(0); }

    const model = await clack.text({
        message: 'Enter the Model name to use:',
        initialValue: 'kimi-k2-0905',
    });
    if (clack.isCancel(model)) { clack.cancel('Setup cancelled.'); process.exit(0); }

    const enableSearxng = await clack.confirm({
        message: 'Enable Searxng (Google Search for Claude)?',
        initialValue: true,
    });
    if (clack.isCancel(enableSearxng)) { clack.cancel('Setup cancelled.'); process.exit(0); }

    /* ──────────── Write .env ──────────── */
    const envContent = [
        `OPENAI_API_KEY=${apiKey}`,
        `OPENAI_BASE_URL=${baseUrl}`,
        `BIG_MODEL=${model}`,
        `MIDDLE_MODEL=${model}`,
        `SMALL_MODEL=${model}`,
        `MAX_TOKENS=8096`,
        `REQUEST_TIMEOUT=600`,
        `IMAGE_ROUTING_ENABLED=true`,
        `IMAGE_ROUTING_MODE=handoff`,
        `VISION_HANDOFF_MAX_TOKENS=1800`,
        `LOG_LEVEL=INFO`,
    ].join('\n') + '\n';

    fs.writeFileSync(path.join(installDir, '.env'), envContent);
    clack.log.success('.env file created.');

    /* ──────────── Install Python Dependencies ──────────── */
    if (pipCmd) {
        const pipSpinner = ora({ text: 'Installing Python dependencies...', color: 'yellow' }).start();
        try {
            execSync(`${pipCmd} install -r requirements.txt`, { cwd: installDir, stdio: 'pipe' });
            pipSpinner.succeed('Python dependencies installed.');
        } catch (err) {
            pipSpinner.warn('Could not install Python dependencies.');
            clack.log.warning(`Run "${pipCmd} install -r requirements.txt" manually.`);
        }
    } else {
        clack.log.warning('pip not found. Install Python dependencies manually.');
    }

    /* ──────────── Docker / Searxng ──────────── */
    if (enableSearxng) {
        if (isDockerRunning()) {
            const dockerSpinner = ora({ text: 'Starting Searxng container...', color: 'blue' }).start();
            try {
                execSync('docker compose up -d', { cwd: installDir, stdio: 'pipe' });
                dockerSpinner.succeed('Searxng is running.');
            } catch {
                dockerSpinner.warn('Could not start Searxng.');
                clack.log.warning('Run "docker compose up -d" in the install folder manually.');
            }
        } else {
            clack.log.warning('Docker is not running. Start Docker Desktop, then run "docker compose up -d".');
        }
    }

    /* ──────────── Claude CLI Check ──────────── */
    const claudeSpinner = ora({ text: 'Checking for Claude Code CLI...', color: 'cyan' }).start();
    try {
        execSync('claude --version', { stdio: 'ignore' });
        claudeSpinner.succeed('Claude Code CLI detected.');
    } catch {
        claudeSpinner.warn('Claude Code CLI not found.');
        const installClaude = await clack.confirm({
            message: 'Install Claude Code CLI globally? (npm install -g @anthropic-ai/claude-code)',
            initialValue: true,
        });
        if (clack.isCancel(installClaude)) { clack.cancel('Setup cancelled.'); process.exit(0); }

        if (installClaude) {
            const installSpinner = ora({ text: 'Installing Claude Code CLI...', color: 'green' }).start();
            try {
                execSync('npm install -g @anthropic-ai/claude-code', { stdio: 'pipe' });
                installSpinner.succeed('Claude Code CLI installed.');
            } catch {
                installSpinner.fail('Failed to install Claude Code CLI.');
                clack.log.error('Run "npm install -g @anthropic-ai/claude-code" manually.');
            }
        }
    }

    /* ──────────── Done ──────────── */
    clack.note(
        `Run ${pc.green(pc.bold('claude-proxy'))} to start.\nInstalled to: ${pc.dim(installDir)}`,
        pc.green('Setup Complete')
    );

    clack.outro(pc.dim('Happy coding!'));
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

#!/usr/bin/env node

/**
 * Claude Code Proxy CLI Orchestrator
 * Premium, cross-platform management of the iFlow proxy lifecycle.
 */

const { execSync, exec } = require('child_process');
const crossSpawn = require('cross-spawn');
const path = require('path');
const fs = require('fs');
const os = require('os');
const pc = require('picocolors');

const pkg = require('../package.json');
const version = `v${pkg.version}`;

const BOX_WIDTH = 72;
const DEFAULT_PORT = 8082;
const PROXY_SCRIPT = 'start_proxy.py';

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

const log = (msg) => console.log(` ${pc.gray('│')} ${msg}`);
const success = (msg) => console.log(` ${pc.gray('│')} ${pc.green('✔')} ${msg}`);

function drawHeader(title, ver) {
    const label = `${pc.bold(title)} ${pc.dim(ver)}`;
    const cleanLen = title.length + 1 + ver.length;
    const tail = Math.max(0, BOX_WIDTH - cleanLen - 6);
    console.log('');
    console.log(` ${pc.magenta('╭───')} ${label} ${pc.magenta('─'.repeat(tail) + '╮')}`);
    console.log(` ${pc.magenta('│')}`);
}

function drawFooter() {
    console.log(` ${pc.magenta('│')}`);
    console.log(` ${pc.magenta('╰' + '─'.repeat(BOX_WIDTH - 2) + '╯')}`);
    console.log('');
}

function getPortPID(port) {
    return new Promise((resolve) => {
        const cmd = os.platform() === 'win32'
            ? `netstat -ano | findstr :${port} | findstr LISTENING`
            : `lsof -t -i :${port}`;

        exec(cmd, (err, stdout) => {
            if (err || !stdout) return resolve(null);
            if (os.platform() === 'win32') {
                const parts = stdout.trim().split(/\s+/);
                resolve(parts[parts.length - 1]);
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

function getInstallDir() {
    return path.resolve(__dirname, '..');
}

async function ensureConfig(installDir) {
    const envPath = path.join(process.cwd(), '.env');
    const localEnvPath = path.join(installDir, '.env');

    if (!fs.existsSync(envPath) && !fs.existsSync(localEnvPath)) {
        try {
            execSync(`node "${path.join(installDir, 'bin', 'setup.js')}"`, { stdio: 'inherit' });
        } catch {
            log(pc.red(pc.bold('✖ Setup aborted.')));
            process.exit(1);
        }
    }
}

async function startProxy(installDir) {
    const existingPid = await getPortPID(DEFAULT_PORT);
    if (existingPid) {
        success(`Using existing proxy ${pc.dim(`[PID: ${existingPid}]`)}`);
        return existingPid;
    }

    const ora = (await import('ora')).default;
    const spinner = ora({
        text: 'Spinning up iFlow Proxy...',
        prefixText: ` ${pc.gray('│')}`,
        color: 'cyan'
    }).start();

    const pythonCmd = getPythonCmd();
    if (!pythonCmd) {
        spinner.fail(pc.red('Python not found. Please install Python 3.8+ first.'));
        process.exit(1);
    }

    crossSpawn(pythonCmd, ['-X', 'utf8', PROXY_SCRIPT], {
        cwd: installDir,
        detached: false,
        stdio: 'ignore'
    });

    let attempts = 0;
    while (attempts < 15) {
        if (await getPortPID(DEFAULT_PORT)) {
            spinner.succeed('Proxy Engine online.');
            const pid = await getPortPID(DEFAULT_PORT);
            return pid;
        }
        await new Promise(r => setTimeout(r, 600));
        attempts++;
    }

    spinner.fail('Proxy failed to boot. See proxy.log for diagnostics.');
    process.exit(1);
}

function runClaude(env) {
    log(`${pc.cyan('Handing over to Claude Code...')}`);

    const claude = crossSpawn('npx', ['@anthropic-ai/claude-code', ...process.argv.slice(2)], {
        stdio: 'inherit',
        env
    });

    return claude;
}

async function cleanup() {
    const currentPid = await getPortPID(DEFAULT_PORT);
    if (currentPid) {
        try {
            if (os.platform() === 'win32') {
                execSync(`taskkill /F /T /PID ${currentPid}`, { stdio: 'ignore' });
            } else {
                process.kill(parseInt(currentPid, 10), 'SIGTERM');
            }
            success('Proxy shutdown complete.');
        } catch {
            // Process already dead
        }
    }
}

async function run() {
    const installDir = getInstallDir();

    drawHeader('Claude-to-iFlow Orchestrator', version);

    await ensureConfig(installDir);
    await startProxy(installDir);

    const env = {
        ...process.env,
        ANTHROPIC_BASE_URL: `http://localhost:${DEFAULT_PORT}`,
        ANTHROPIC_API_KEY: 'any-value'
    };

    const claudeProc = runClaude(env);

    claudeProc.on('exit', async (code) => {
        await cleanup();
        drawFooter();
        process.exit(code || 0);
    });

    claudeProc.on('error', async (err) => {
        log(pc.red(pc.bold(`✖ Failed to launch Claude Code: ${err.message}`)));
        if (err.code === 'ENOENT') {
            log(pc.dim('Tip: Ensure "npm" and "npx" are in your PATH.'));
        }
        await cleanup();
        drawFooter();
        process.exit(1);
    });

    const handleExit = async () => {
        await cleanup();
        drawFooter();
        process.exit(0);
    };

    process.on('SIGINT', handleExit);
    process.on('SIGTERM', handleExit);
    if (os.platform() !== 'win32') {
        process.on('SIGHUP', handleExit);
    }
}

run().catch(err => {
    console.error(pc.red(err.message));
    process.exit(1);
});

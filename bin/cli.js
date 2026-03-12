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

function isProcessRunning(pid) {
    try {
        process.kill(parseInt(pid, 10), 0);
        return true;
    } catch {
        return false;
    }
}

function registerSession(installDir) {
    const sessionsDir = path.join(installDir, 'sessions');
    if (!fs.existsSync(sessionsDir)) {
        fs.mkdirSync(sessionsDir, { recursive: true });
    }
    const sessionFile = path.join(sessionsDir, `${process.pid}.lock`);
    fs.writeFileSync(sessionFile, String(Date.now()));
    return sessionFile;
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
    // 1. Check for a globally saved location file
    const locFile = path.join(os.homedir(), '.claude-proxy-loc');
    if (fs.existsSync(locFile)) {
        try {
            const savedPath = fs.readFileSync(locFile, 'utf-8').trim();
            if (fs.existsSync(savedPath)) {
                return savedPath;
            }
        } catch { }
    }

    // 2. Fallback to package root
    return path.resolve(__dirname, '..');
}

function validateConfig(vars) {
    // OPENAI_API_KEY is strictly required (backend will crash without it)
    // BASE_URL and BIG_MODEL are required to ensure the proxy targets iFlow properly
    const mandatoryKeys = ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'BIG_MODEL'];
    return mandatoryKeys.every(key => vars[key] && vars[key].trim() !== '');
}

async function ensureConfig(installDir) {
    const envVars = loadEnvFile(installDir);

    if (!validateConfig(envVars)) {
        const result = crossSpawn.sync('node', [path.join(installDir, 'bin', 'setup.js')], { stdio: 'inherit' });
        if (result.status !== 0) {
            log(pc.red(pc.bold('✖ Setup aborted.')));
            process.exit(result.status || 1);
        }
    }
}

function loadEnvFile(installDir) {
    const envFile = path.join(installDir, '.env');
    if (!fs.existsSync(envFile)) return {};

    const vars = {};
    const lines = fs.readFileSync(envFile, 'utf-8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        vars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
    }
    return vars;
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

    const envVars = loadEnvFile(installDir);

    const logPath = path.join(installDir, 'proxy.log');
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });

    const proxyProc = crossSpawn(pythonCmd, ['-X', 'utf8', PROXY_SCRIPT], {
        cwd: installDir,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ...envVars }
    });

    proxyProc.stdout.pipe(logStream);
    proxyProc.stderr.pipe(logStream);
    proxyProc.unref();

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

async function cleanup(installDir, silent = false) {
    // 1. Remove our own session lock
    const sessionFile = path.join(installDir, 'sessions', `${process.pid}.lock`);
    if (fs.existsSync(sessionFile)) {
        try { fs.unlinkSync(sessionFile); } catch { }
    }

    // 2. Scan for other active sessions
    const sessionsDir = path.join(installDir, 'sessions');
    let otherActiveSessions = 0;

    if (fs.existsSync(sessionsDir)) {
        const files = fs.readdirSync(sessionsDir);
        for (const file of files) {
            if (file.endsWith('.lock')) {
                const pid = file.replace('.lock', '');
                if (pid !== String(process.pid) && isProcessRunning(pid)) {
                    otherActiveSessions++;
                } else if (pid !== String(process.pid)) {
                    // Cleanup stale lock files from crashed processes
                    try { fs.unlinkSync(path.join(sessionsDir, file)); } catch { }
                }
            }
        }
    }

    // 3. Only shut down proxy if we are the last one
    if (otherActiveSessions === 0) {
        const currentPid = await getPortPID(DEFAULT_PORT);
        if (currentPid) {
            try {
                if (os.platform() === 'win32') {
                    execSync(`taskkill /F /T /PID ${currentPid}`, { stdio: 'ignore' });
                } else {
                    process.kill(parseInt(currentPid, 10), 'SIGTERM');
                }
                if (!silent) success('Proxy shutdown complete.');
            } catch {
                // Process already dead
            }
        }
    } else {
        if (!silent) log(pc.dim(`${otherActiveSessions} session(s) active, keeping proxy alive.`));
    }
}

async function handleUninstall() {
    drawHeader('Claude-to-iFlow Uninstall', version);
    const locFile = path.join(os.homedir(), '.claude-proxy-loc');
    const installDir = getInstallDir();

    await cleanup(installDir, true);

    const ora = (await import('ora')).default;
    const spinner = ora({
        text: 'Wiping all traces...',
        prefixText: ` ${pc.gray('│')}`,
        color: 'red'
    }).start();

    try {
        // Delete install directory if it exists and is not the package root
        const pkgRoot = path.resolve(__dirname, '..');
        if (installDir && fs.existsSync(installDir) && installDir !== pkgRoot) {
            fs.rmSync(installDir, { recursive: true, force: true });
        }

        // Delete mapping file
        if (fs.existsSync(locFile)) {
            fs.unlinkSync(locFile);
        }

        spinner.succeed('Deep cleanup complete.');
        log(pc.dim('The proxy files and configuration have been removed.'));
        log(pc.dim('To finish, run: npm uninstall -g @graviton711/claude-code-proxy'));
    } catch (err) {
        spinner.fail(`Cleanup failed: ${err.message}`);
    }

    drawFooter();
    process.exit(0);
}

async function run() {
    const installDir = getInstallDir();

    if (process.argv.includes('--uninstall')) {
        await handleUninstall();
        return;
    }

    // Flag Detection - Suppress header if user is running non-interactive flags
    const args = process.argv.slice(2);
    const isInteractive = args.length === 0 || !args.some(arg => arg.startsWith('-'));
    
    if (isInteractive) {
        drawHeader('Claude-to-iFlow Orchestrator', version);
    } else {
        log(pc.dim(`\n Claude-to-iFlow v${version} (Transparent Proxy Active)`));
    }

    try {
        await ensureConfig(installDir);
    } catch (err) {
        // Setup cancelled or failed
        if (isInteractive) drawFooter();
        process.exit(1);
    }

    await startProxy(installDir);
    registerSession(installDir);

    const env = {
        ...process.env,
        ANTHROPIC_BASE_URL: `http://localhost:${DEFAULT_PORT}`,
        ANTHROPIC_API_KEY: 'any-value'
    };

    const claudeProc = runClaude(env);

    claudeProc.on('exit', async (code) => {
        // Use silent cleanup for a cleaner exit experience
        await cleanup(installDir, true);
        if (isInteractive) drawFooter();
        process.exit(code || 0);
    });

    claudeProc.on('error', async (err) => {
        log(pc.red(pc.bold(`✖ Failed to launch Claude Code: ${err.message}`)));
        if (err.code === 'ENOENT') {
            log(pc.dim('Tip: Ensure "npm" and "npx" are in your PATH.'));
        }
        await cleanup(installDir, true);
        if (isInteractive) drawFooter();
        process.exit(1);
    });

    const handleExit = async () => {
        await cleanup(installDir, true);
        if (isInteractive) drawFooter();
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

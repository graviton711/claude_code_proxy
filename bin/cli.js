#!/usr/bin/env node

/**
 * Claude Code Proxy CLI Orchestrator
 * High-performance, low-friction management of the proxy lifecycle.
 */

const { spawn, execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const pkg = require('../package.json');
const version = `v${pkg.version}`;

// Colors & Styling
const colors = {
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    magenta: '\x1b[35m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    reset: '\x1b[0m'
};

const log = (msg) => console.log(` ${colors.gray}│${colors.reset} ${msg}`);
const info = (msg) => console.log(` ${colors.gray}│${colors.reset} ${colors.cyan}${msg}${colors.reset}`);
const warn = (msg) => console.log(` ${colors.gray}│${colors.reset} ${colors.yellow}⚠ ${msg}${colors.reset}`);
const error = (msg) => console.error(` ${colors.gray}│${colors.reset} ${colors.red}${colors.bold}✖ ${msg}${colors.reset}`);
const success = (msg) => console.log(` ${colors.gray}│${colors.reset} ${colors.green}✔ ${msg}${colors.reset}`);

function drawHeader(title, version) {
    const termWidth = process.stdout.columns || 80;
    const line = '─'.repeat(Math.max(0, termWidth - title.length - version.length - 10));
    console.log(`\n ${colors.magenta}╭───${colors.reset} ${colors.bold}${title}${colors.reset} ${colors.dim}${version}${colors.reset} ${colors.magenta}${line}╮${colors.reset}`);
    console.log(` ${colors.magenta}│${colors.reset}`);
}

function drawFooter() {
    const termWidth = process.stdout.columns || 80;
    const line = '─'.repeat(Math.max(0, termWidth - 4));
    console.log(` ${colors.magenta}│${colors.reset}`);
    console.log(` ${colors.magenta}╰${line}╯${colors.reset}\n`);
}

// Configuration
const DEFAULT_PORT = 8082;
const PROXY_EXE = 'python';
const PROXY_SCRIPT = 'start_proxy.py';

async function getPortPID(port) {
    return new Promise((resolve) => {
        const cmd = os.platform() === 'win32' 
            ? `netstat -ano | findstr :${port} | findstr LISTENING`
            : `lsof -t -i :${port}`;
        
        exec(cmd, (err, stdout) => {
            if (err || !stdout) return resolve(null);
            if (os.platform() === 'win32') {
                const parts = stdout.trim().split(/\s+/);
                resolve(parts[parts.length - 1]); // Last item is PID
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
        } catch (e) {
            error('Setup aborted.');
            process.exit(1);
        }
    }
}

async function startProxy(installDir) {
    const existingPid = await getPortPID(DEFAULT_PORT);
    if (existingPid) {
        info(`Using existing proxy [PID: ${existingPid}]`);
        return existingPid;
    }

    info('Spinning up iFlow Proxy...');
    
    const proxyProc = spawn(PROXY_EXE, ['-X', 'utf8', PROXY_SCRIPT], {
        cwd: installDir,
        detached: false, 
        stdio: 'ignore'  
    });

    let attempts = 0;
    while (attempts < 15) {
        if (await getPortPID(DEFAULT_PORT)) {
            success('Proxy Engine online.');
            return proxyProc.pid;
        }
        await new Promise(r => setTimeout(r, 600));
        attempts++;
    }

    error('Proxy failed to boot. See proxy.log for diagnostics.');
    process.exit(1);
}

function runClaude() {
    info('Handing over to Claude Code...');
    
    const env = { 
        ...process.env, 
        ANTHROPIC_BASE_URL: `http://localhost:${DEFAULT_PORT}`,
        ANTHROPIC_API_KEY: 'any-value'
    };

    // To avoid [DEP0190] warning on Node 22+ and ensure reliability on Windows
    const isWin = os.platform() === 'win32';
    const cmd = isWin ? 'npx.cmd' : 'npx';
    
    const claude = spawn(cmd, ['@anthropic-ai/claude-code', ...process.argv.slice(2)], {
        stdio: 'inherit',
        env,
        shell: false 
    });

    return claude;
}

async function run() {
    const installDir = getInstallDir();
    
    drawHeader('Claude-to-iFlow Orchestrator', version);

    await ensureConfig(installDir);
    const proxyPid = await startProxy(installDir);
    
    const claudeProc = runClaude();

    const cleanup = async () => {
        const currentPid = await getPortPID(DEFAULT_PORT);
        if (currentPid) {
            info('Cleaning up proxy processes...');
            try {
                if (os.platform() === 'win32') {
                    // Taskkill /F /T ensures child processes (like the python interpreter) are also killed
                    execSync(`taskkill /F /T /PID ${currentPid}`, { stdio: 'ignore' });
                } else {
                    process.kill(currentPid, 'SIGTERM');
                }
                success('Proxy shutdown complete.');
            } catch (e) {
                // Ignore errors if process already dead
            }
        }
    };

    // Handle normal exit
    claudeProc.on('exit', async (code) => {
        await cleanup();
        drawFooter();
        process.exit(code || 0);
    });

    // Handle abrupt exit (Ctrl+C)
    process.on('SIGINT', async () => {
        await cleanup();
        drawFooter();
        process.exit(0);
    });

    // Handle unexpected errors in spawn
    claudeProc.on('error', async (err) => {
        error(`Failed to launch Claude Code: ${err.message}`);
        if (err.code === 'ENOENT') {
            info('Tip: Ensure "npm" and "npx" are in your PATH.');
        }
        await cleanup();
        drawFooter();
        process.exit(1);
    });
}

run().catch(err => {
    error(err.message);
    process.exit(1);
});

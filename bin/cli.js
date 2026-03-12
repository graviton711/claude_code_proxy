#!/usr/bin/env node

/**
 * Claude Code Proxy CLI Orchestrator
 * High-performance, low-friction management of the proxy lifecycle.
 */

const { spawn, execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

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

const LOG_PREFIX = `${colors.bold}${colors.magenta}ᗑ${colors.reset}`;

const log = (msg) => console.log(`${LOG_PREFIX} ${msg}`);
const info = (msg) => console.log(`${LOG_PREFIX} ${colors.cyan}${msg}${colors.reset}`);
const warn = (msg) => console.log(`${LOG_PREFIX} ${colors.yellow}⚠ ${msg}${colors.reset}`);
const error = (msg) => console.error(`${LOG_PREFIX} ${colors.red}${colors.bold}✖ ${msg}${colors.reset}`);
const success = (msg) => console.log(`${LOG_PREFIX} ${colors.green}✔ ${msg}${colors.reset}`);

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
        warn('Configuration missing. Initiating Setup...');
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

    // On Windows, running CLI tools via spawn often requires shell: true
    // regardless of the .cmd extension to ensure PATH resolution works correctly.
    const cmd = os.platform() === 'win32' ? 'npx' : 'npx';
    const claude = spawn(cmd, ['@anthropic-ai/claude-code', ...process.argv.slice(2)], {
        stdio: 'inherit',
        env,
        shell: os.platform() === 'win32'
    });

    return claude;
}

async function run() {
    const installDir = getInstallDir();
    
    console.log(`${colors.magenta}${colors.bold}`);
    console.log(`   ${colors.magenta}ᗑ${colors.white} Claude-to-iFlow${colors.dim} Manage v1.0.1${colors.reset}`);
    console.log('');

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
        process.exit(code || 0);
    });

    // Handle abrupt exit (Ctrl+C)
    process.on('SIGINT', async () => {
        await cleanup();
        process.exit(0);
    });

    // Handle unexpected errors in spawn
    claudeProc.on('error', async (err) => {
        error(`Failed to launch Claude Code: ${err.message}`);
        await cleanup();
        process.exit(1);
    });
}

run().catch(err => {
    error(err.message);
    process.exit(1);
});

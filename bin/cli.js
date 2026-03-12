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

const LOG_PREFIX = `${colors.bold}${colors.magenta}[CLAUDE-PROXY]${colors.reset}`;

const log = (msg) => console.log(`${LOG_PREFIX} ${msg}`);
const info = (msg) => console.log(`${LOG_PREFIX} ${colors.cyan}${msg}${colors.reset}`);
const warn = (msg) => console.log(`${LOG_PREFIX} ${colors.yellow}${msg}${colors.reset}`);
const error = (msg) => console.error(`${LOG_PREFIX} ${colors.red}${colors.bold}ERROR: ${msg}${colors.reset}`);
const success = (msg) => console.log(`${LOG_PREFIX} ${colors.green}✔ ${msg}${colors.reset}`);

// Configuration
const DEFAULT_PORT = 8082;
const PROXY_EXE = 'python';
const PROXY_SCRIPT = 'start_proxy.py';

async function isPortOpen(port) {
    return new Promise((resolve) => {
        const cmd = os.platform() === 'win32' 
            ? `netstat -ano | findstr :${port} | findstr LISTENING`
            : `lsof -i :${port} | grep LISTEN`;
        
        exec(cmd, (err, stdout) => {
            resolve(stdout && stdout.length > 0);
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
        warn('Configuration not found. Launching setup wizard...');
        try {
            // Run setup.js in the same process
            execSync(`node "${path.join(installDir, 'bin', 'setup.js')}"`, { stdio: 'inherit' });
        } catch (e) {
            error('Setup aborted.');
            process.exit(1);
        }
    }
}

async function startProxy(installDir) {
    const isBusy = await isPortOpen(DEFAULT_PORT);
    if (isBusy) {
        info('Proxy already running on port ' + DEFAULT_PORT);
        return null;
    }

    info('Starting proxy backend...');
    
    const proxyProc = spawn(PROXY_EXE, ['-X', 'utf8', PROXY_SCRIPT], {
        cwd: installDir,
        detached: false, 
        stdio: 'ignore'  
    });

    let attempts = 0;
    while (attempts < 15) {
        if (await isPortOpen(DEFAULT_PORT)) {
            success('Proxy is ready.');
            return proxyProc;
        }
        await new Promise(r => setTimeout(r, 600));
        attempts++;
    }

    error('Proxy failed to start within timeout. Check proxy.log for details.');
    process.exit(1);
}

function runClaude() {
    info('Launching Claude Code...');
    
    const env = { 
        ...process.env, 
        ANTHROPIC_BASE_URL: `http://localhost:${DEFAULT_PORT}`,
        ANTHROPIC_API_KEY: 'any-value'
    };

    const claude = spawn('npx', ['@anthropic-ai/claude-code', ...process.argv.slice(2)], {
        stdio: 'inherit',
        env,
        shell: os.platform() === 'win32'
    });

    return claude;
}

async function run() {
    const installDir = getInstallDir();
    
    console.log(`${colors.magenta}${colors.bold}`);
    console.log(`   ▐▛███▜▌  ${colors.white}Claude-to-iFlow CLI Manager${colors.magenta}`);
    console.log(`   ▝▜█████▛▘ ${colors.dim}v1.0.0${colors.reset}`);
    console.log('');

    await ensureConfig(installDir);
    const proxyProc = await startProxy(installDir);
    
    const claudeProc = runClaude();

    const cleanup = () => {
        if (proxyProc) {
            info('Shutting down proxy...');
            proxyProc.kill('SIGTERM');
            // On Windows, sometimes we need more force
            if (os.platform() === 'win32') {
                try {
                    execSync(`taskkill /F /T /PID ${proxyProc.pid}`, { stdio: 'ignore' });
                } catch (e) {}
            }
        }
    };

    claudeProc.on('exit', (code) => {
        cleanup();
        process.exit(code || 0);
    });

    process.on('SIGINT', () => {
        cleanup();
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        cleanup();
        process.exit(0);
    });
}

run().catch(err => {
    error(err.message);
    process.exit(1);
});

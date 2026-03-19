const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.resolve(__dirname, '../..');
const maxBufferLength = 120000;

let shellProcess = null;
let shellLabel = '';
let outputBuffer = '';
const subscribers = new Set();

function getShellDefinition() {
  if (process.platform === 'win32') {
    return {
      command: 'powershell.exe',
      args: ['-NoLogo'],
      label: 'powershell',
    };
  }

  return {
    command: '/bin/bash',
    args: [],
    label: 'bash',
  };
}

function trimBuffer() {
  if (outputBuffer.length > maxBufferLength) {
    outputBuffer = outputBuffer.slice(-maxBufferLength);
  }
}

function emit(event, payload) {
  subscribers.forEach((listener) => listener(event, payload));
}

function appendOutput(text) {
  if (!text) {
    return;
  }

  outputBuffer += text;
  trimBuffer();
  emit('chunk', { chunk: text });
}

function ensureSession() {
  if (shellProcess && !shellProcess.killed) {
    return shellProcess;
  }

  const shell = getShellDefinition();
  shellLabel = shell.label;

  shellProcess = spawn(shell.command, shell.args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      TERM: process.env.TERM || 'xterm-256color',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  appendOutput(`[wiregate terminal connected to ${shell.label} in ${repoRoot}]\n`);

  shellProcess.stdout.on('data', (chunk) => appendOutput(chunk.toString()));
  shellProcess.stderr.on('data', (chunk) => appendOutput(chunk.toString()));
  shellProcess.on('error', (error) => {
    appendOutput(`\n[terminal error] ${error.message}\n`);
    emit('error', { error: error.message });
  });
  shellProcess.on('close', (code) => {
    appendOutput(`\n[terminal exited with code ${code}]\n`);
    shellProcess = null;
    emit('exit', { code });
  });

  return shellProcess;
}

function getState() {
  ensureSession();
  return {
    running: Boolean(shellProcess && !shellProcess.killed),
    shell: shellLabel,
    cwd: repoRoot,
    output: outputBuffer,
  };
}

function writeInput(input) {
  const command = `${input || ''}`;
  if (!command.trim()) {
    throw new Error('Terminal input is required.');
  }

  ensureSession();
  shellProcess.stdin.write(`${command}\n`);

  return {
    ok: true,
    sent: command,
  };
}

function interrupt() {
  ensureSession();
  shellProcess.stdin.write('\u0003');
  appendOutput('^C\n');
  return { ok: true };
}

function clearOutput() {
  outputBuffer = '';
  emit('clear', {});
  return getState();
}

function subscribe(listener) {
  ensureSession();
  subscribers.add(listener);
  listener('snapshot', getState());

  return () => {
    subscribers.delete(listener);
  };
}

module.exports = {
  getState,
  writeInput,
  interrupt,
  clearOutput,
  subscribe,
};

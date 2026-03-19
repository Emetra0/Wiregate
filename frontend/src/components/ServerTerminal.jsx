import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerm } from 'xterm';
import 'xterm/css/xterm.css';
import { useToast } from './Toast';

function getTerminalWsUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/system/terminal/ws`;
}

const ServerTerminal = forwardRef(function ServerTerminal({ className = '', height = '68vh' }, ref) {
  const { showToast } = useToast();
  const hostRef = useRef(null);
  const terminalRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    const terminal = new XTerm({
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 14,
      theme: {
        background: '#081019',
        foreground: '#e8eef7',
      },
      scrollback: 5000,
      allowTransparency: false,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(hostRef.current);
    fitAddon.fit();
    terminal.focus();

    terminalRef.current = terminal;

    const socket = new WebSocket(getTerminalWsUrl());
    socketRef.current = socket;

    const sendResize = () => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }

      socket.send(
        JSON.stringify({
          type: 'resize',
          cols: terminal.cols,
          rows: terminal.rows,
        })
      );
    };

    socket.addEventListener('open', () => {
      sendResize();
    });

    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        const { event: type, payload } = message;

        if (type === 'snapshot') {
          terminal.clear();
          terminal.write(payload.output || '');
          sendResize();
          return;
        }

        if (type === 'chunk') {
          terminal.write(payload.chunk || '');
          return;
        }

        if (type === 'clear') {
          terminal.clear();
          return;
        }

        if (type === 'error') {
          showToast(payload.error || 'Terminal error', 'error');
          return;
        }

        if (type === 'exit') {
          terminal.write(`\r\n[terminal exited with code ${payload.code}]\r\n`);
        }
      } catch {
        showToast('Terminal stream parse error', 'error');
      }
    });

    socket.addEventListener('close', () => {
      terminal.write('\r\n[terminal disconnected]\r\n');
    });

    socket.addEventListener('error', () => {
      showToast('Terminal connection failed', 'error');
    });

    const dataDisposable = terminal.onData((data) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }

      socket.send(JSON.stringify({ type: 'input', data }));
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      sendResize();
    });
    resizeObserver.observe(hostRef.current);

    return () => {
      dataDisposable.dispose();
      resizeObserver.disconnect();
      socket.close();
      terminal.dispose();
    };
  }, [showToast]);

  useImperativeHandle(ref, () => ({
    runCommand(command) {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        throw new Error('Terminal is not connected yet.');
      }

      socket.send(JSON.stringify({ type: 'input', data: `${command}\r` }));
    },
    interrupt() {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        throw new Error('Terminal is not connected yet.');
      }

      socket.send(JSON.stringify({ type: 'interrupt' }));
    },
    clear() {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        throw new Error('Terminal is not connected yet.');
      }

      socket.send(JSON.stringify({ type: 'clear' }));
    },
    focus() {
      terminalRef.current?.focus();
    },
  }));

  return <div ref={hostRef} className={`vm-terminal-host ${className}`.trim()} style={{ height, minHeight: height }} />;
});

export default ServerTerminal;
import { useEffect, useRef } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerm } from 'xterm';
import 'xterm/css/xterm.css';
import Header from '../components/Header';
import { useToast } from '../components/Toast';

function getTerminalWsUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/system/terminal/ws`;
}

export default function TerminalPage() {
  const { showToast } = useToast();
  const hostRef = useRef(null);
  const terminalRef = useRef(null);
  const fitRef = useRef(null);
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
    fitRef.current = fitAddon;

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

  return (
    <div className="page">
      <Header title="Terminal" subtitle="Live Ubuntu VM terminal session." />
      <div className="card section-card terminal-page-card">
        <div className="section-head">
          <div>
            <h2>Ubuntu VM terminal</h2>
            <p className="page-sub">This is the live PTY session from the Ubuntu server, not a fake command box.</p>
          </div>
        </div>
        <div ref={hostRef} className="vm-terminal-host" />
      </div>
    </div>
  );
}

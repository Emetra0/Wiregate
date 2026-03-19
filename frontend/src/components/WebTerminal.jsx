import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { api } from '../api';
import { useToast } from './Toast';

const terminalHistoryStorageKey = 'wiregate-web-terminal-history';

function readStoredTerminalHistory() {
  try {
    const raw = window.localStorage.getItem(terminalHistoryStorageKey);
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string' && item.trim()) : [];
  } catch {
    return [];
  }
}

const WebTerminal = forwardRef(function WebTerminal(_props, ref) {
  const { showToast } = useToast();
  const [output, setOutput] = useState('Connecting to shell...');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(() => readStoredTerminalHistory());
  const [historyIndex, setHistoryIndex] = useState(-1);
  const outputRef = useRef(null);

  useEffect(() => {
    const stopStream = api.streamSystemTerminal({
      onSnapshot: (data) => {
        setOutput(data.output || '');
      },
      onChunk: (chunk) => {
        setOutput((current) => `${current}${chunk}`);
      },
      onClear: () => {
        setOutput('');
      },
      onExit: () => {
        setOutput((current) => `${current}\n[terminal disconnected]\n`);
      },
      onError: (error) => {
        showToast(error.message, 'error');
      },
    });

    return () => {
      stopStream?.();
    };
  }, [showToast]);

  useEffect(() => {
    const panel = outputRef.current;
    if (!panel) {
      return;
    }

    panel.scrollTop = panel.scrollHeight;
  }, [output]);

  useEffect(() => {
    try {
      window.localStorage.setItem(terminalHistoryStorageKey, JSON.stringify(history.slice(0, 100)));
    } catch {
      // Ignore storage failures.
    }
  }, [history]);

  const submitCommand = useCallback(
    async (rawInput) => {
      const nextInput = `${rawInput || ''}`.trim();
      if (!nextInput) {
        return false;
      }

      setBusy(true);
      try {
        await api.sendSystemTerminalInput(nextInput);
        setHistory((current) => {
          const deduped = current.filter((item) => item !== nextInput);
          return [nextInput, ...deduped].slice(0, 100);
        });
        setHistoryIndex(-1);
        setInput('');
        return true;
      } catch (error) {
        showToast(error.message, 'error');
        setOutput((current) => `${current}\n[error] ${error.message}\n`);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [showToast]
  );

  const interruptCommand = useCallback(async () => {
    setBusy(true);
    try {
      await api.interruptSystemTerminal();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }, [showToast]);

  const clearTerminal = useCallback(async () => {
    try {
      await api.clearSystemTerminal();
      setOutput('');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }, [showToast]);

  const handleHistoryKey = useCallback(
    (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
        return;
      }

      if (!history.length) {
        return;
      }

      event.preventDefault();

      if (event.key === 'ArrowUp') {
        const nextIndex = Math.min(historyIndex + 1, history.length - 1);
        setHistoryIndex(nextIndex);
        setInput(history[nextIndex] || '');
        return;
      }

      const nextIndex = historyIndex - 1;
      if (nextIndex < 0) {
        setHistoryIndex(-1);
        setInput('');
        return;
      }

      setHistoryIndex(nextIndex);
      setInput(history[nextIndex] || '');
    },
    [history, historyIndex]
  );

  useImperativeHandle(
    ref,
    () => ({
      runCommand: submitCommand,
      interrupt: interruptCommand,
      clear: clearTerminal,
    }),
    [clearTerminal, interruptCommand, submitCommand]
  );

  return (
    <>
      <pre ref={outputRef} className="terminal web-terminal-output">{output || ' '}</pre>

      <div className="web-terminal-controls">
        <input
          className="input web-terminal-input mono-text"
          placeholder="Type a command and press Enter"
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setHistoryIndex(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submitCommand(input);
              return;
            }

            handleHistoryKey(event);
          }}
        />
        <div className="button-row">
          <button className="btn btn-primary" type="button" onClick={() => submitCommand(input)} disabled={busy}>
            Send
          </button>
          <button className="btn btn-amber" type="button" onClick={interruptCommand} disabled={busy}>
            Ctrl+C
          </button>
          <button className="btn btn-ghost" type="button" onClick={clearTerminal}>
            Clear
          </button>
        </div>
      </div>
    </>
  );
});

export default WebTerminal;

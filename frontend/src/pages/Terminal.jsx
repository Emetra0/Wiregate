import Header from '../components/Header';
import ServerTerminal from '../components/ServerTerminal';

export default function TerminalPage() {
  return (
    <div className="page">
      <Header title="Terminal" subtitle="Direct Ubuntu shell session." />
      <div className="card section-card terminal-page-card">
        <div className="section-head">
          <div>
            <h2>Ubuntu shell</h2>
            <p className="page-sub">This opens the real shell on the Ubuntu server and auto-fits for desktop and phone screens.</p>
          </div>
        </div>
        <ServerTerminal height="68vh" mobileHeight="calc(100dvh - 230px)" />
      </div>
    </div>
  );
}

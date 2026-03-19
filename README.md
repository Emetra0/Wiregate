# WireGate

Browser-based admin panel for managing WireGuard VPN users.
Run it on your Ubuntu server and manage users from any browser on your network.
No cloud services. No subscriptions. Fully open source.

## Screenshots
[placeholder — add screenshots after UI is built]

## Features
- Add and remove WireGuard VPN users with one click
- Download or scan a QR code for the VPN config file
- Live dashboard showing connected users and server stats
- Start, stop and restart WireGuard from the browser
- Demo mode for testing without a real WireGuard server
- One-command install script for Ubuntu

## Requirements
- Ubuntu 22.04 or later
- WireGuard installed and configured
- Node.js 18+
- A WireGuard interface (`wg0`) already set up

## Quick install (Ubuntu)
```bash
git clone https://github.com/YOUR_USERNAME/wiregate.git
cd wiregate
chmod +x install.sh
sudo ./install.sh
```

## Manual setup
1. Clone the repository.
2. Run `npm install` inside `backend/`.
3. Run `npm install` inside `frontend/`.
4. Copy `.env.example` to `.env`.
5. Fill in the environment values.
6. Start the backend with `npm run dev` inside `backend/`.
7. Start the frontend with `npm run dev` inside `frontend/`.
8. Open `http://localhost:5173`.

## Environment variables
| Variable | Description |
| --- | --- |
| `PORT` | Backend port used by the Express server |
| `FRONTEND_URL` | Allowed browser origin for CORS during development |
| `WG_INTERFACE` | WireGuard interface name, usually `wg0` |
| `WG_SERVER_ENDPOINT` | Public IP or hostname clients use to connect |
| `WG_SERVER_PORT` | WireGuard listen port |
| `WG_SERVER_PUBLIC_KEY` | Public key of the server interface |
| `WG_SUBNET` | First three octets of the WireGuard subnet, for example `10.0.0` |
| `WG_DNS` | DNS server pushed to clients |
| `DEMO_MODE` | When `true`, skips real WireGuard commands and returns safe demo data |

## Demo mode
Set `DEMO_MODE=true` to run WireGate on any OS without WireGuard installed.
This uses fake status, peer and system data so the UI can be tested safely.

## Security note
WireGate should only be reachable on your local network or behind a VPN.
Never expose port 3001 directly to the public internet.
The panel has no authentication by default, so add HTTP auth, a reverse proxy policy, or a network-level control if you need extra protection.
Private keys are generated and delivered once, then discarded.

## Running locally for development
Open two terminals.

Backend:
```bash
cd backend
cp ../.env.example .env
npm install
npm run dev
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

## Running on a real Ubuntu server
```bash
ssh user@your-server-ip
git clone https://github.com/YOUR_USERNAME/wiregate.git
cd wiregate
chmod +x install.sh
sudo ./install.sh
sudo nano .env
sudo systemctl restart wiregate
```

## Sudoers rule required on Ubuntu
```bash
sudo visudo -f /etc/sudoers.d/wiregate
```

Add:
```text
your_user ALL=(ALL) NOPASSWD: /usr/bin/wg, /usr/bin/wg-quick
```

The install script writes this rule automatically for the invoking user.

## License
MIT

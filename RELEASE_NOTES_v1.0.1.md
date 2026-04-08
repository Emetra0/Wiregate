# WireGate v1.0.1

## Fixes

- Fixed WireGuard port updates so changing the forwarded port also updates the interface `ListenPort`.
- Fixed the apply flow so the running WireGuard interface is reloaded after a port change instead of keeping the old listening port until a manual restart.
- Fixed firewall rule handling so the new UDP port is opened and the old port rule is removed when the server port changes.

## Technical details

- `WG_SERVER_PORT` and the WireGuard config `ListenPort` now stay aligned.
- `PostUp` and `PostDown` rules are regenerated with the updated port.
- The backend reloads `wg-quick@<interface>` after port or subnet changes.

## Upgrade notes

- If you update from an older version, save your network settings once after updating if you want to force the running interface and firewall rules to be refreshed.
- Router port forwarding still needs to point to the same UDP port on the Ubuntu server.

## Validation

- Frontend production build completed successfully with `npm run build`.
- Updated release version: `1.0.1`.

## Suggested GitHub release title

`WireGate v1.0.1`

## Suggested GitHub release summary

This patch fixes a WireGuard port sync issue where changing the forwarded port did not reliably update the active `ListenPort`. The server now updates the WireGuard config, refreshes firewall rules, and reloads the interface so the new port is applied immediately.

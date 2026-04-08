# WireGate v1.0.2

## Fixes

- Fixed `wg0.conf` persistence so changing the WireGuard port no longer gets reverted by `wg-quick save` behavior.
- Fixed installer and backend config generation to disable `SaveConfig`, which was overwriting manual interface-file edits.
- Fixed bootstrap syncing so the app now trusts the live `wg0.conf` values for `ListenPort` and subnet when an existing interface config is already present.
- Fixed peer persistence so add, remove, and subnet migration changes are written directly into the WireGuard config file instead of relying on `wg-quick save`.

## Manual config behavior

- Manual edits to `/etc/wireguard/wg0.conf` are now preserved across app-driven port changes and interface restarts.
- The WireGuard config file is treated as the source of truth for existing interface port and subnet values.

## Validation

- Backend validation passed for the updated WireGuard persistence files.
- Release version updated to `1.0.2`.

## Suggested GitHub release title

`WireGate v1.0.2`

## Suggested GitHub release summary

This patch fixes WireGuard config persistence so `ListenPort` and other manual `wg0.conf` edits are no longer overwritten during app updates or interface restarts. Peer updates are now written directly to the config file, and the backend syncs existing interface values from the live WireGuard config.
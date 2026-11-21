#!/usr/bin/env bash
# Sets up `laurel-check <name>`, the only way a Laurel agent runs the repo's checks. Each check runs as the
# unprivileged user laurelcheck, on a copy of the workspace without .git, with an empty environment. Repo code
# (tests, lint plugins, install scripts) therefore cannot read the GitHub or gateway tokens the agent holds:
# another uid cannot read their /proc environ, and the workspace and runner home are made private here.
# Run as root. Inputs: CHECK_COMMANDS ("name: command" lines), LAUREL_WS, LAUREL_RUNNER_USER,
# LAUREL_RUNNER_HOME, and optionally NODE_BIN (the node to copy for the check user).
set -euo pipefail
: "${CHECK_COMMANDS:?}" "${LAUREL_WS:?}" "${LAUREL_RUNNER_USER:?}" "${LAUREL_RUNNER_HOME:?}"
user=laurelcheck
home=/home/$user
conf=/etc/laurel-check

id "$user" >/dev/null 2>&1 || useradd --create-home --home-dir "$home" --shell /usr/sbin/nologin "$user"
install -d -m 755 -o root -g root "$conf" /usr/local/libexec
printf '%s\n' "$CHECK_COMMANDS" | grep -E '^[a-z][a-z0-9-]*: *[^ ]' > "$conf/commands" || true
if [ ! -s "$conf/commands" ]; then
  echo "No valid 'name: command' lines in check_commands." >&2
  exit 1
fi
printf '%s\n' "$LAUREL_WS" > "$conf/workspace"
chmod 644 "$conf/commands" "$conf/workspace"

# The runner's tool cache sits in its private work directory, so the check user gets its own copy of Node.
if [ -n "${NODE_BIN:-}" ]; then
  node_dir=$(dirname "$(dirname "$(readlink -f "$NODE_BIN")")")
  rm -rf /opt/laurel-node
  cp -a "$node_dir" /opt/laurel-node
  chown -R root:root /opt/laurel-node
  PATH=/opt/laurel-node/bin:$PATH corepack enable --install-directory /opt/laurel-node/bin
fi

# A runner can serve many jobs, so nothing an earlier job's checks left behind carries over: no processes, no
# files in the check user's home, no work tree. The work tree sits in a root-owned parent, so the check user
# cannot swap it for a symlink that root would then follow.
# The runner has no CAP_KILL, so only the check user can kill its own processes. Repeat in case one was forking.
for _ in 1 2 3 4 5; do
  pgrep -u "$user" >/dev/null || break
  runuser -u "$user" -- pkill -KILL -u "$user" || true
done
if pgrep -u "$user" >/dev/null; then echo "laurel-check: $user processes survived the kill" >&2; exit 1; fi
find "$home" -mindepth 1 -delete
find /tmp /var/tmp /dev/shm -xdev -user "$user" -delete 2>/dev/null || true
rm -rf /var/lib/laurel-check
install -d -m 755 -o root -g root /var/lib/laurel-check
install -d -m 700 -o "$user" -g "$user" /var/lib/laurel-check/work

cat > /usr/local/libexec/laurel-check-root <<'EOF'
#!/usr/bin/env bash
# Runs one named check as laurelcheck. Only names in /etc/laurel-check/commands run; extra arguments are ignored.
# Root never touches a path laurelcheck controls: cleanup and extraction run as laurelcheck.
set -uo pipefail
conf=/etc/laurel-check
name="${1:-}"
cmd=""
if [[ "$name" =~ ^[a-z][a-z0-9-]*$ ]]; then
  cmd=$(sed -n "s/^$name: *//p" "$conf/commands" | head -n 1)
fi
if [ -z "$cmd" ]; then
  echo "laurel-check: unknown check '$name'. Known checks: $(cut -d: -f1 "$conf/commands" | tr '\n' ' ')"
  exit 2
fi
ws=$(cat "$conf/workspace")
dest=/var/lib/laurel-check/work
as_check() { runuser -u laurelcheck -- env -i HOME=/home/laurelcheck LANG=C.UTF-8 CI=true \
  PATH=/opt/laurel-node/bin:/usr/local/bin:/usr/bin:/bin COREPACK_ENABLE_DOWNLOAD_PROMPT=0 "$@"; }
# A process an earlier check left running could change this check's files or result.
as_check pkill -KILL -u laurelcheck
# node_modules survives between checks, so only the setup check installs dependencies.
as_check find "$dest" -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +
tar -C "$ws" --exclude=.git --exclude=.laurel --exclude=node_modules -cf - . | as_check tar -C "$dest" -xf -
cd "$dest" || exit 1
timeout 1200 runuser -u laurelcheck -- env -i HOME=/home/laurelcheck LANG=C.UTF-8 CI=true \
  PATH=/opt/laurel-node/bin:/usr/local/bin:/usr/bin:/bin COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  bash -c "$cmd" 2>&1 | tail -n 300
status=${PIPESTATUS[0]}
as_check pkill -KILL -u laurelcheck
[ "$status" = 124 ] && echo "laurel-check: '$name' ran past 20 minutes and was stopped."
echo "laurel-check: $name exited $status"
exit "$status"
EOF

cat > /usr/local/bin/laurel-check <<'EOF'
#!/bin/sh
# Runs one of the repo's checks as an unprivileged user with no tokens. Usage: laurel-check <name>
exec sudo -n /usr/local/libexec/laurel-check-root "$@"
EOF
chown root:root /usr/local/libexec/laurel-check-root /usr/local/bin/laurel-check
chmod 755 /usr/local/libexec/laurel-check-root /usr/local/bin/laurel-check

echo "$LAUREL_RUNNER_USER ALL=(root) NOPASSWD: /usr/local/libexec/laurel-check-root" > /etc/sudoers.d/laurel-check
chmod 440 /etc/sudoers.d/laurel-check
visudo -cf /etc/sudoers.d/laurel-check >/dev/null

# The work directory holds the workspace (.git/config has the push token), RUNNER_TEMP and the tool cache.
chmod 700 "$(dirname "$(dirname "$LAUREL_WS")")" "$LAUREL_RUNNER_HOME"

# Prove the boundary before any agent relies on it.
leaks=$(runuser -u "$user" -- env -i sh -c "
  cat '$LAUREL_WS/.git/config' 2>/dev/null | head -c 1
  for f in /proc/[0-9]*/environ; do grep -lsa 'GITHUB_TOKEN\|ANTHROPIC_API_KEY' \"\$f\"; done
  true
")
if [ -n "$leaks" ]; then
  echo "laurelcheck can read the runner's secrets: $leaks" >&2
  exit 1
fi
echo "laurel-check is ready: $(cut -d: -f1 "$conf/commands" | tr '\n' ' ')"

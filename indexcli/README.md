# indexcli

Cloud-connected CLI for IndexBlue infrastructure access.

## Install

From this repository:

```bash
npm install -g ./indexcli
```

If you publish the package to a registry later:

```bash
npm install -g indexcli
```

## Authentication

Use an existing platform API key:

```bash
indexcli login --key <PLATFORM_API_KEY>
```

Or start the device approval flow:

```bash
indexcli generate-key
```

That prints a verification URL and pairing code. Approve it in the IndexBlue Cloud Infrastructure workspace, then the CLI stores the granted API key locally.

Check current state:

```bash
indexcli status
```

Detailed runtime diagnostics:

```bash
indexcli doctor
```

Clear local auth and infra binding:

```bash
indexcli logout
```

Show CLI version:

```bash
indexcli version
```

## Connect A Machine

Foreground agent:

```bash
indexcli infra connect --name "My Machine"
```

Background agent:

```bash
indexcli infra connect --name "My Machine" --background
```

The connected machine will appear in the Cloud Infrastructure console and start sending metrics, processes, sandbox state, and command results.

## Persistent Working Directory

Store a reusable working directory for future commands:

```bash
indexcli cd ~/workspace
indexcli pwd
```

Most commands run from that stored directory unless you override it.

## Local Commands

Run shell commands locally:

```bash
indexcli exec -- "pwd && ls -la"
indexcli exec --cwd /srv/app -- "git status"
```

Run common system commands directly without wrapping them in `exec`:

```bash
indexcli ls -la
indexcli grep -r "TODO" .
indexcli git status
indexcli npm install
indexcli python --version
indexcli docker ps
```

Open a persistent interactive shell:

```bash
indexcli shell
```

## Sudo / Root-Aware Execution

Check whether `sudo` exists and whether the current account already has passwordless access:

```bash
indexcli sudo status
```

Run privileged commands through normal `sudo`:

```bash
indexcli sudo apt update
indexcli sudo systemctl restart nginx
```

Or open a root-aware shell:

```bash
indexcli shell --sudo
```

If `sudo` requires a password, the terminal will prompt you normally. For non-interactive runs, you can provide one through:

```bash
export INDEXCLI_SUDO_PASSWORD='your-password'
indexcli sudo apt update
```

`indexcli` does not automatically write a blanket `NOPASSWD:ALL` sudoers rule onto the machine.

## Filesystem Helpers

Structured filesystem operations are also available:

```bash
indexcli fs ls /path
indexcli fs read /path/file.txt
indexcli fs write /path/file.txt "hello world"
indexcli fs mkdir /path/new-dir
indexcli fs mv /path/a /path/b
indexcli fs cp /path/a /path/b
indexcli fs rm /path/file.txt
indexcli fs rm /path/dir --recursive
```

Sandbox lifecycle:

```bash
indexcli sandbox list
indexcli sandbox create demo /absolute/workspace/path "npm run dev"
indexcli sandbox start demo
indexcli sandbox stop demo
indexcli sandbox restart demo
indexcli sandbox delete demo
```

When a sandbox or direct command starts a web server such as `npm run dev`, `npm start`, or `npm run preview`, `indexcli` will watch for newly listening ports and print:

- the local preview URL, such as `http://127.0.0.1:3000`
- the Cloud Infrastructure preview URL, such as `/cloud-preview/<infraId>/<port>`

If the machine is connected to IndexBlue, the same preview will also appear in the Cloud Infrastructure dashboard automatically.

## Preview URLs And DNS

IndexBlue now exposes detected preview ports through the machine detail page in Cloud Infrastructure.

- Path-based preview URLs work immediately and do not require DNS
- You can optionally set a custom preview domain base such as `dev.example.com`
- After saving it in the dashboard, add the wildcard DNS record shown there
- Preview hosts then follow the pattern `PORT--INFRA_ID.dev.example.com`

This gives each connected machine its own predictable subdomain-style preview host.

## What The Agent Syncs

- Machine registration and identity
- Configured working directory
- CPU, memory, uptime, process count, network stats
- Live process snapshots
- Sandbox inventory and lifecycle state
- Remote command execution output
- Filesystem operation results

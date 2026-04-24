# GuideBard Self-Hosted Setup Guide
### Multi-Tenant Edition

---

This guide is for organizations and developers running GuideBard as a shared platform — where multiple teams, clients, or users each have their own isolated workspace under one installation. If you are setting this up just for yourself, the Single-Tenant Setup Guide is a simpler fit.

The multi-tenant edition uses the same Docker-based setup as the single-tenant version, with one key difference: user registration is open (or can be restricted by invitation), and every account belongs to a separate **tenant** — a fully isolated workspace with its own recordings, guides, videos, and settings. Data between tenants cannot be seen or accessed by other tenants, even though they all share the same server.

---

## What Is GuideBard?

GuideBard is a screen recording and tutorial creation platform. Users record their screen directly in the browser and GuideBard produces two things automatically:

- **Step-by-step written guides** — structured tutorials with auto-captured screenshots, an annotation editor for marking up those screenshots, and one-click PDF export
- **Narrated tutorial videos** — the screen recording with an AI-generated voiceover composited in, delivered as a standard MP4

From there, users can publish directly to a connected **YouTube channel** or **WordPress.org site**, download files, or do both. Every user manages their own AI API keys (OpenAI, Anthropic, ElevenLabs, and others), which GuideBard encrypts before storing. Your platform never sees their raw keys.

In multi-tenant mode, you are the platform operator. Your tenants are your users or customers. Each tenant signs up, configures their own AI integrations, and works independently without any overlap with other accounts.

---

## Before You Begin

### What You Will Need

**A Linux server.** The multi-tenant setup is designed to run on a virtual private server (VPS) or dedicated server accessible from the internet. It can technically run on a local machine, but without a public domain name and SSL certificate, some browser features (especially screen recording) will not work reliably for remote users. Providers like DigitalOcean, Hetzner, Vultr, and Linode all work well.

**A domain name** pointing to your server. You will need to update your domain's DNS to point an A record at your server's IP address before running setup.

**Docker and Docker Compose.** On a fresh Ubuntu 22.04 server, run the following to install both:

```bash
# Install Docker
curl -fsSL https://get.docker.com | sudo bash

# Add your user to the Docker group so you don't need sudo every time
sudo usermod -aG docker $USER

# Log out and back in for the group change to take effect, then verify
docker --version
docker compose version
```

**Git:**
```bash
sudo apt install git -y
```

### Minimum Server Specifications

| Component | Minimum | Recommended for 10+ active users |
|---|---|---|
| CPU | 4 cores | 8+ cores |
| RAM | 8 GB | 16 GB |
| Disk | 50 GB SSD | 200+ GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| Bandwidth | 1 TB/month | Unmetered or 5 TB/month |

Video composition is CPU and disk-intensive. If many users compose videos simultaneously, a larger server or auto-scaling arrangement will be necessary.

---

## Step 1 — Download GuideBard

Connect to your server over SSH, then run:

```bash
git clone https://github.com/replybotz/GuideBard.git
cd GuideBard
```

---

## Step 2 — Set Up SSL (HTTPS)

Screen recording in modern browsers requires a secure context — meaning your site must be served over HTTPS. You need to set this up before users can record their screens. We recommend **Caddy** because it handles SSL certificate issuance and renewal automatically.

Install Caddy:
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy -y
```

Create a Caddyfile at `/etc/caddy/Caddyfile` with the following content, replacing `guide.yourdomain.com` with your actual domain:

```
guide.yourdomain.com {
    reverse_proxy localhost:80
}
```

Reload Caddy:
```bash
sudo systemctl reload caddy
```

Caddy will automatically obtain a free SSL certificate from Let's Encrypt within a minute or two. Your site will be reachable at `https://guide.yourdomain.com` once the certificate is issued.

> **Note on DNS:** Your domain's A record must already be pointing to your server's IP before this step. Certificate issuance will fail if DNS hasn't propagated. You can check propagation at [https://dnschecker.org](https://dnschecker.org).

---

## Step 3 — Configure the Environment

Copy the example configuration file:
```bash
cp .env.example .env
```

Open it in a text editor:
```bash
nano .env
```

You will need to update the following values. Everything else can stay at its default.

---

### DEPLOYMENT_MODE

Change this from `single_tenant` to `multi_tenant`:

```
DEPLOYMENT_MODE=multi_tenant
```

This one change enables user registration, creates separate tenant workspaces for each account, and activates all multi-tenant data isolation.

---

### SECRET_KEY and ENCRYPTION_KEY

These are cryptographic keys that secure JWT tokens and encrypt stored API keys respectively. Generate them with:

```bash
openssl rand -hex 64   # for SECRET_KEY
openssl rand -base64 32  # for ENCRYPTION_KEY
```

Copy the output of each command into the corresponding field in `.env`. Never share these values and back them up somewhere secure — losing them means stored credentials become unreadable.

```
SECRET_KEY=paste-your-generated-value-here
ENCRYPTION_KEY=paste-your-generated-value-here
```

---

### DB_PASSWORD and MINIO_SECRET_KEY

Generate strong passwords for the internal database and file storage:

```bash
openssl rand -hex 24  # run this twice — once for each
```

```
DB_PASSWORD=your-generated-database-password
MINIO_SECRET_KEY=your-generated-minio-password
```

---

### DATABASE_URL and DATABASE_URL_SYNC

Update both lines to use your new `DB_PASSWORD`:

```
DATABASE_URL=postgresql+asyncpg://guidebard:your-generated-database-password@postgres:5432/guidebard
DATABASE_URL_SYNC=postgresql://guidebard:your-generated-database-password@postgres:5432/guidebard
```

---

### APP_URL

Set this to your actual domain, including `https://`:

```
APP_URL=https://guide.yourdomain.com
```

---

### NEXT_PUBLIC_API_URL and NEXT_PUBLIC_WS_URL

Update these to match your domain:

```
NEXT_PUBLIC_API_URL=https://guide.yourdomain.com/api
NEXT_PUBLIC_WS_URL=wss://guide.yourdomain.com/ws
NEXT_PUBLIC_DEPLOYMENT_MODE=multi_tenant
```

Note the `wss://` prefix (WebSocket Secure) instead of `ws://` — this is required when serving over HTTPS.

---

### ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD

Set credentials for the built-in platform administrator account. In multi-tenant mode, this account is used for platform-level management.

```
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=choose-a-strong-password-here
```

Save the file when done (`Ctrl+X`, then `Y`, then Enter in nano).

---

## Step 4 — Open Firewall Ports

Allow HTTP and HTTPS traffic through your server's firewall:

```bash
sudo ufw allow 22/tcp      # SSH (keep this open)
sudo ufw allow 80/tcp      # HTTP (Caddy redirects this to HTTPS)
sudo ufw allow 443/tcp     # HTTPS
sudo ufw enable
```

If your hosting provider has a separate firewall panel (like DigitalOcean's "Firewall" or AWS Security Groups), add the same rules there as well.

---

## Step 5 — Start GuideBard

Build and start all services:

```bash
docker compose up -d --build
```

The first run will download and build all required components. This typically takes 5–15 minutes depending on your server's internet connection. You can watch the progress with:

```bash
docker compose logs -f
```

When all services are up, you will see log lines indicating the backend is ready. You can also check status with:

```bash
docker compose ps
```

All containers should show a status of `Up` or `Up (healthy)`.

---

## Step 6 — Verify the Installation

Open your browser and navigate to `https://guide.yourdomain.com`. You should see the GuideBard login screen served securely over HTTPS (look for the padlock icon in the address bar).

Sign in with the admin credentials you set in the `.env` file. If the login succeeds, your installation is working correctly.

At this point, the platform is live. Users can register by clicking "Create an account" on the login screen — each registration creates a new, fully isolated tenant workspace.

---

## Understanding Multi-Tenancy in GuideBard

It helps to understand how the isolation model works so you can explain it to your users or configure it appropriately.

**Every account is a tenant.** When a user registers, GuideBard creates a tenant record and associates that user with it. All of their recordings, guides, videos, API keys, voice profiles, and publishing connections belong to their tenant and only their tenant.

**Data isolation is enforced at the database level.** GuideBard uses PostgreSQL Row-Level Security (RLS) — a feature built into the database itself — to ensure that every query is automatically filtered to the current tenant. Even a bug in application code cannot cause one tenant's data to appear in another's.

**Each tenant manages their own AI keys.** Tenants go to their own Settings page to add API keys for OpenAI, ElevenLabs, Anthropic, and any other providers they want to use. The platform operator (you) does not need to provide shared AI access. This also means costs flow directly from each tenant to their own AI provider accounts.

**There is currently no billing integration enabled by default.** GuideBard stores a `stripe_customer_id` and `stripe_subscription_id` field on tenant records for future Stripe integration, but the billing logic itself must be implemented separately if you want to charge tenants. Out of the box, registration is open and free.

---

## Managing the Platform

### Viewing Running Services

```bash
docker compose ps
```

### Restarting a Specific Service

```bash
docker compose restart backend
docker compose restart worker
```

### Viewing Logs

```bash
# All services
docker compose logs -f

# Just the API backend
docker compose logs -f backend

# Just the background worker (AI generation, video composition)
docker compose logs -f worker

# Just the database
docker compose logs -f postgres
```

### Scaling the Background Worker

If many users are generating content simultaneously, you can run multiple worker processes to handle the load. Edit `docker-compose.yml` and find the `worker` service. Add a `deploy` section:

```yaml
worker:
  ...
  deploy:
    replicas: 3
```

Then apply the change:
```bash
docker compose up -d --scale worker=3
```

Workers share the same job queues, so adding more of them directly increases throughput for AI generation and video composition tasks.

---

## Backups

Losing data on a shared platform affects all of your tenants, so backups should be taken seriously. The three things you need to back up are:

### 1. PostgreSQL Database

All structured data (user accounts, guides, guide steps, video metadata, etc.) lives here. Take a daily automated snapshot:

```bash
docker compose exec postgres pg_dump -U guidebard guidebard | gzip > backup-$(date +%Y%m%d).sql.gz
```

Set this up as a cron job on your server:
```bash
crontab -e
```
Add this line (runs daily at 2 AM):
```
0 2 * * * cd /path/to/GuideBard && docker compose exec -T postgres pg_dump -U guidebard guidebard | gzip > /backups/postgres-$(date +\%Y\%m\%d).sql.gz
```

### 2. MinIO Storage Volumes

Recordings, screenshots, videos, audio files, and voice samples are stored in MinIO. The Docker volume `guidebard_minio_data` contains all of this. Back it up by syncing to an S3 bucket, a remote server, or an external drive. The MinIO console (accessible at port 9001, see below) also provides a built-in bucket replication feature.

### 3. The .env File

Your `.env` file contains the `ENCRYPTION_KEY` that encrypts all stored API credentials. Without it, the encrypted data in the database cannot be read. Store a copy of this file in at least two secure locations (a password manager, encrypted cloud storage, etc.).

---

## The MinIO Storage Console

MinIO includes a built-in web interface for browsing and managing stored files. It is accessible on port 9001:

```
http://your-server-ip:9001
```

Log in with the `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` values from your `.env` file. From here you can browse uploaded recordings and videos, set up bucket replication for backups, and monitor storage usage.

> **Security note:** Port 9001 is the MinIO admin console. You should either block it from public access with a firewall rule and access it through an SSH tunnel, or put it behind an authenticated reverse proxy. Do not leave it publicly accessible unless it is a deliberate choice.

To access the MinIO console securely via SSH tunnel:
```bash
ssh -L 9001:localhost:9001 user@your-server-ip
```
Then open `http://localhost:9001` in your browser.

---

## Updating GuideBard

To update to a newer version:

```bash
cd GuideBard
git pull
docker compose up -d --build
```

This pulls the latest code, rebuilds the images, and restarts services. The database migration runs automatically on startup — your data is preserved. Plan updates during low-traffic periods, as there will be a brief downtime (typically under 2 minutes) while containers restart.

---

## Stopping and Starting

```bash
# Stop all services (data is preserved)
docker compose down

# Start again
docker compose up -d
```

---

## High-Level User Experience

When a user first arrives at your GuideBard installation:

1. **They register** — clicking "Create an account" on the login screen creates their account and a private tenant workspace
2. **They add AI keys** — in Settings → AI Providers, they paste in API keys for the services they use. GuideBard encrypts these immediately
3. **They record** — from the Record screen, they share their screen in the browser and GuideBard starts recording. When they stop, it processes the recording and triggers AI guide and script generation automatically
4. **They edit** — guides open in a rich text editor where steps can be reordered and screenshots can be annotated with arrows, rectangles, and labels
5. **They produce videos** — with a script ready, they select a voice profile, generate narration audio, then click Compose to produce the final MP4
6. **They publish** — from the Publish section, they can upload directly to their connected YouTube channel or post to their WordPress site

All of this happens within their private workspace. They cannot see other users' content, and other users cannot see theirs.

---

## Troubleshooting

**Users report "Screen recording failed" or no permission prompt appears**
This almost always means the site is not being served over HTTPS. Modern browsers only allow `getDisplayMedia()` (screen recording) on secure origins. Confirm your SSL setup is working with `curl -I https://guide.yourdomain.com`. If you see a certificate error or redirect to HTTP, revisit Step 2.

**Registration creates an account but the user cannot log in**
Check the backend logs: `docker compose logs -f backend`. Look for errors referencing tenant creation or database constraints.

**AI generation starts but never completes**
This is usually a worker issue. Check `docker compose logs -f worker`. Common causes: the worker container exited (check with `docker compose ps`), or the tenant's AI API key has no remaining credits.

**Disk usage is growing quickly**
Video files are large. Set up a retention policy if needed — users should regularly download and remove old video files. You can also configure MinIO bucket lifecycle rules to automatically expire old objects after a set number of days.

**Certificate not being issued by Caddy**
Ensure port 80 and 443 are open in your firewall, and that your domain's DNS A record is pointing to the correct server IP. Let's Encrypt validates ownership over HTTP before issuing the certificate.

**The database container shows unhealthy**
Run `docker compose logs postgres` to see the error. The most common cause is incorrect `DB_PASSWORD` values — make sure the password in `DATABASE_URL` exactly matches `DB_PASSWORD`.

---

## Security Recommendations

Running a shared platform comes with responsibilities. Here are the most important things to do before inviting users:

- **Change all default passwords** — the setup does this, but double-check that `DB_PASSWORD`, `MINIO_SECRET_KEY`, and `ADMIN_PASSWORD` are all random and strong
- **Block the MinIO console port** from public access: `sudo ufw deny 9001/tcp`
- **Keep Docker and the OS updated** — run `sudo apt update && sudo apt upgrade -y` regularly
- **Back up the `.env` file and database daily** — as described in the Backups section
- **Rotate `SECRET_KEY` periodically** — this invalidates all existing login sessions, so notify users in advance. After updating it in `.env`, restart the backend: `docker compose restart backend`
- **Monitor disk usage** — video files accumulate quickly. Set up an alert when disk usage exceeds 70%: `df -h /` on the command line, or use a monitoring tool like Netdata or UptimeRobot

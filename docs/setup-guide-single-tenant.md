# GuideBard Self-Hosted Setup Guide
### Single-User / Single-Tenant Edition

---

Welcome to GuideBard. This guide walks you through everything you need to get your self-hosted installation up and running — from installing the prerequisites all the way to recording your first tutorial. No prior server experience is required, and the whole process typically takes under 20 minutes.

---

## What Is GuideBard?

GuideBard is a screen recording and tutorial creation tool that lives entirely on your own computer or server. You record your screen directly in the browser, and GuideBard automatically generates:

- **Step-by-step written guides** — with screenshots pulled from your recording, formatted with your own annotations, and exportable as a PDF
- **Narrated tutorial videos** — your recording with an AI-generated voiceover layered in, delivered as a standard MP4 file you can share or upload anywhere

From there you can publish straight to a connected **YouTube channel** or **WordPress.org site**, download the files, or do both.

Because this is the single-tenant edition, GuideBard runs as a private, personal workspace. There are no other user accounts, no shared spaces, and no subscription fees tied to the software itself. You supply the AI API keys you already have (OpenAI, Anthropic, ElevenLabs, and several others are supported), and GuideBard uses them on your behalf. You stay in full control of your content and your costs.

---

## Before You Begin

You need two things installed on your computer:

### 1. Docker Desktop

Docker is the engine that runs all of GuideBard's components automatically. You do not need to install Python, Node.js, databases, or anything else separately — Docker handles all of that.

- **Mac:** Download Docker Desktop from [https://docs.docker.com/desktop/install/mac-install/](https://docs.docker.com/desktop/install/mac-install/)
- **Windows:** Download Docker Desktop from [https://docs.docker.com/desktop/install/windows-install/](https://docs.docker.com/desktop/install/windows-install/)
- **Linux:** Follow the guide at [https://docs.docker.com/engine/install/](https://docs.docker.com/engine/install/) for your distribution, then install Docker Compose with `sudo apt install docker-compose-plugin` (Ubuntu/Debian) or the equivalent for your distro

After installing, open Docker Desktop and wait for it to show a green "Docker is running" status before continuing. On Windows, make sure "Use WSL 2 based engine" is enabled in Docker settings.

### 2. Git

Git is needed to download the GuideBard source files.

- **Mac:** Git comes pre-installed. Open Terminal and type `git --version` to confirm.
- **Windows:** Download Git from [https://git-scm.com/download/windows](https://git-scm.com/download/windows) and install with all default options.
- **Linux:** Install with `sudo apt install git` (Ubuntu/Debian) or `sudo dnf install git` (Fedora/RHEL).

---

## Step 1 — Download GuideBard

Open a terminal (on Mac/Linux) or Git Bash (on Windows) and run the following two commands:

```bash
git clone https://github.com/replybotz/GuideBard.git
cd GuideBard
```

This downloads the application into a folder called `GuideBard` and moves you into it. Everything you do from this point forward happens inside that folder.

---

## Step 2 — Run the Setup Script

GuideBard includes an interactive setup script that handles the entire initial configuration. Run it with:

```bash
bash scripts/setup.sh
```

The script will ask you four questions:

**Admin password**
This is the password you will use to log into GuideBard. It must be at least 8 characters. Choose something strong — treat it like any important account password.

**Admin username**
The username for your account. Press Enter to accept the default (`admin`) or type your preferred username.

**Admin email**
Your email address. Press Enter to accept the default or type your actual email. This is stored locally and used only for account identification — GuideBard does not send emails in the single-tenant setup.

**App URL**
The web address where GuideBard will be accessible. If you are running it on your own computer for personal use, press Enter to accept the default (`http://localhost`). If you are running it on a server with a domain name (for example, `https://guide.yourdomain.com`), type that address here.

Once you answer those questions, the script generates a secure configuration file, then starts all of GuideBard's services. The first run downloads several software images (about 2–3 GB), so this can take 5–10 minutes depending on your internet connection. Subsequent starts are much faster.

When setup is complete, you will see:

```
✓ GuideBard is running!

  Open in browser: http://localhost
  Username: admin
```

---

## Step 3 — Open GuideBard

Open your browser and go to [http://localhost](http://localhost) (or the URL you set during setup). You should see the GuideBard login screen. Sign in with the username and password you created in Step 2.

If you see a blank page or an error on first load, wait 30 seconds and refresh. The application services sometimes need a moment to fully initialize after setup completes.

---

## Step 4 — Connect Your AI Provider

GuideBard does not include built-in AI — it works with the AI API providers you already use. You need at least one AI provider connected before you can generate guides or voiceover scripts.

Go to **Settings** (the gear icon in the left sidebar) and click the **AI Providers** tab.

You will see a list of supported providers. For each one you want to use, paste in your API key and click **Save**. GuideBard encrypts all API keys before storing them — they are never visible in plain text after saving.

**Recommended starting point:** Connect **OpenAI** (for guide and script generation) and **ElevenLabs** (for voice synthesis). Both offer free trial credits if you don't have accounts yet.

### Supported AI Providers

| Provider | What It's Used For | Where to Get a Key |
|---|---|---|
| OpenAI | Guide generation, script writing, voice (optional) | platform.openai.com |
| Anthropic | Guide generation, script writing | console.anthropic.com |
| Google Gemini | Guide generation, script writing | aistudio.google.com |
| xAI Grok | Guide generation, script writing | console.x.ai |
| Perplexity | Guide generation, script writing | perplexity.ai/api |
| OpenRouter | Access to 200+ models with one key | openrouter.ai |
| ElevenLabs | Voice synthesis, voice cloning | elevenlabs.io |
| Ollama | Local AI models (no key needed, must be running separately) | ollama.ai |

You only need to connect the providers you actually want to use. You do not need all of them.

After saving a key, click the **Test** button next to it to confirm GuideBard can reach that provider successfully.

---

## Step 5 — (Optional) Set Up a Voice Profile

If you want your tutorial videos to have narration, you will need a voice profile. Go to **Settings → Voice**.

You have two options:

**Use a pre-built voice:** ElevenLabs provides dozens of high-quality voices you can choose from without any additional setup. Once your ElevenLabs key is saved, click **Browse ElevenLabs Voices**, pick one you like, and save it as a profile.

**Clone your own voice:** If you have an ElevenLabs key, you can upload a clean audio sample (30 seconds minimum, MP3 or WAV) and ElevenLabs will create a custom voice that sounds like you. Give it a name, upload the file, and click **Clone Voice**. Cloning usually takes under a minute.

---

## Step 6 — (Optional) Connect YouTube or WordPress

If you want to publish directly from GuideBard, go to **Settings → Publishing**.

**WordPress.org:** Enter your site's URL, your WordPress username, and an Application Password. Application Passwords are generated inside WordPress at Users → Your Profile → Application Passwords. GuideBard uses these to post on your behalf without needing your main login credentials.

**YouTube:** Click **Connect via Google OAuth**, enter the Client ID and Client Secret from a Google Cloud project that has the YouTube Data API v3 enabled. A Google sign-in window will open. After you authorize it, your channel is connected. If you are not sure how to set up a Google Cloud project for this, search for "YouTube Data API v3 OAuth credentials" — Google's own documentation walks through it in detail.

Publishing integrations are entirely optional. You can always download your guides and videos directly and upload them yourself.

---

## Understanding the Interface

GuideBard is organized around five main sections in the left sidebar:

**Dashboard** — A quick overview showing your recent projects, guides, and videos at a glance.

**Projects** — A project is a container for related work. If you are creating a tutorial series about a specific product or workflow, keep everything in one project. Projects are optional but helpful for staying organized.

**Record** — This is where you start a new screen recording. GuideBard will ask for permission to share your screen, then record everything you do. When you stop, it processes the recording and automatically kicks off guide and script generation in the background.

**Guides** — Your generated text guides live here. You can edit them, rearrange steps, draw annotations on screenshots, and export them as PDF files.

**Videos** — Your composed tutorial videos live here. After a guide's narration script is generated, you select a voice, generate the audio, then compose the final video. Composing combines your original recording with the AI narration into a single MP4.

---

## Updating GuideBard

When a new version is released, updating is straightforward:

```bash
cd GuideBard
git pull
docker compose up -d --build
```

This pulls the latest code and rebuilds the application. Your data (recordings, guides, videos, settings) is stored in Docker volumes and is not affected by updates.

---

## Stopping and Restarting

To stop GuideBard:
```bash
docker compose down
```

To start it again later:
```bash
docker compose up -d
```

You do not need to run the setup script again. Your configuration and all your data persist between restarts.

---

## Backing Up Your Data

GuideBard stores all data in Docker volumes on your machine. To back up:

1. Stop GuideBard: `docker compose down`
2. Back up the Docker volumes directory. On Linux this is typically `/var/lib/docker/volumes/guidebard_*`. On Mac and Windows with Docker Desktop, volumes are managed inside the Docker virtual machine — use `docker run --rm -v guidebard_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-backup.tar.gz /data` to export each volume.
3. Keep a copy of your `.env` file somewhere safe. It contains the encryption keys needed to access your data.

**Important:** If you lose the `.env` file, your stored API keys cannot be decrypted. Back it up alongside your volume data.

---

## Troubleshooting

**The browser shows an error or blank page after setup**
Wait 60 seconds and refresh. If the issue persists, run `docker compose logs backend` to check for errors.

**"Docker is not running" error during setup**
Open Docker Desktop and wait for the green status indicator before running the setup script.

**Recording fails or the browser asks repeatedly for screen share permission**
Screen recording in the browser requires a secure context (HTTPS) in some browsers when accessed from any address other than `localhost`. If you are running GuideBard on a remote server, set up SSL (see the Advanced section below) or use a tunneling tool like Cloudflare Tunnel to expose it securely.

**AI generation fails with an error**
Go to Settings → AI Providers and click **Test** next to the provider you are using. If the test fails, double-check that the API key is correct and that your account has available credits or an active subscription with that provider.

**Port 80 is already in use**
If another application on your machine is using port 80, you will see a "port is already allocated" error. Edit `docker-compose.yml` and change `"80:80"` to something like `"8080:80"`, then access GuideBard at `http://localhost:8080`.

---

## Advanced: Running on a Server with a Domain

If you are hosting GuideBard on a VPS or dedicated server and want to access it from the internet:

1. Point your domain's DNS A record to your server's IP address.
2. Edit the `.env` file and update `APP_URL` to `https://yourdomain.com`.
3. Also update `NEXT_PUBLIC_API_URL` to `https://yourdomain.com/api` and `NEXT_PUBLIC_WS_URL` to `wss://yourdomain.com/ws`.
4. Set up SSL termination in front of GuideBard. The recommended approach is a reverse proxy like Caddy (`apt install caddy`) or Nginx with Certbot. Caddy in particular handles SSL certificates automatically with almost no configuration.
5. Restart with `docker compose up -d`.

Opening port 80 and 443 on your server's firewall is also required. On Ubuntu, that is:
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

---

## System Requirements

| Component | Minimum | Recommended |
|---|---|---|
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB free | 50+ GB free |
| OS | Linux, macOS 12+, Windows 10+ | Ubuntu 22.04 LTS |
| Browser | Chrome 114+, Edge 114+, Firefox 116+ | Chrome (best screen recording support) |

Video composition and AI generation are the most resource-intensive operations. On the minimum spec, longer recordings may take several minutes to process.

---

## Getting Help

If you run into something not covered here, the following commands are your first stop:

```bash
# View all service logs
docker compose logs -f

# View just the backend API logs
docker compose logs -f backend

# View the background worker logs (AI generation, video composition)
docker compose logs -f worker

# Check which containers are running
docker compose ps
```

These logs will usually contain enough information to identify what went wrong. Include them when requesting support.

# Deploying HYVE to AWS EC2

This guide walks through deploying the full HYVE stack (React + FastAPI + PostgreSQL + Redis) to a single AWS EC2 instance using Docker Compose.

**Architecture:** Nginx (port 80) serves the React SPA and reverse-proxies `/api/*` to FastAPI. PostgreSQL and Redis run as Docker containers with named volumes. Only port 80 and port 22 are exposed publicly.

**Estimated cost:** Free tier eligible for 12 months (t3.micro, 750 hrs/month). After 12 months: ~$8/month (t3.micro + 30 GiB gp3, us-east-1).

---

## Prerequisites

- An AWS account
- Your repo cloned locally and pushed to GitHub (or any Git host)
- API keys for OpenAI and Canopy API

---

## Step 1: Launch the EC2 Instance

1. Go to **EC2 → Launch Instance** in the AWS Console
2. Configure the instance:

| Setting | Value |
|---|---|
| Name | `hyve-production` |
| AMI | **Amazon Linux 2023 (x86_64)** — search "Amazon Linux 2023", select the x86_64 variant |
| Instance type | `t3.micro` |
| Key pair | Create new or select existing → download the `.pem` file |
| Storage | **30 GiB, gp3** |

3. **Network settings → Edit → Add inbound rules:**
   - Type: HTTP, Port: 80, Source: `0.0.0.0/0`
   - Type: SSH, Port: 22, Source: **My IP** (do not use `0.0.0.0/0`)

4. Click **Launch instance**

Wait until instance state = `Running` and status checks = `2/2 checks passed` (~2 minutes).

---

## Step 2: Connect via SSH

```bash
chmod 400 your-key.pem
ssh -i your-key.pem ec2-user@<ec2-public-ip>
```

Find your public IP in **EC2 → Instances → your instance → Public IPv4 address**.

---

## Step 3: Install Docker

```bash
sudo dnf update -y
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
```

**Log out and back in** — this is required for the `docker` group to take effect:

```bash
exit
ssh -i your-key.pem ec2-user@<ec2-public-ip>
```

Verify Docker works:

```bash
docker run --rm hello-world
```

Expected: `Hello from Docker!`

---

## Step 4: Install Docker Compose and Buildx Plugins

Amazon Linux 2023's bundled plugins are outdated. Install both manually:

```bash
sudo mkdir -p /usr/local/lib/docker/cli-plugins

# Docker Compose
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Docker Buildx (required by compose build — system version is too old)
BUILDX_VER=$(curl -s https://api.github.com/repos/docker/buildx/releases/latest \
  | grep '"tag_name"' | cut -d'"' -f4)
sudo curl -SL \
  "https://github.com/docker/buildx/releases/download/${BUILDX_VER}/buildx-${BUILDX_VER}.linux-amd64" \
  -o /usr/local/lib/docker/cli-plugins/docker-buildx
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx
```

Verify both:

```bash
docker compose version   # expect: Docker Compose version v2.x.x
docker buildx version    # expect: github.com/docker/buildx v0.17.0 or later
```

---

## Step 5: Swap Space (Optional)

The embedding model runs via OpenAI/Gemini API calls — PyTorch is not loaded locally, so the backend is lean enough to run on 1 GB RAM without swap.

If you want a safety net against OOM kills under heavy concurrent load, add 1 GB swap:

```bash
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Otherwise, skip this step entirely.

---

## Step 6: Clone the Repository

```bash
git clone <your-repo-url> ~/hyve
cd ~/hyve
```

---

## Step 7: Configure Environment Variables

```bash
cp backend/.env.production backend/.env
nano backend/.env
```

Fill in every `<placeholder>`:

| Variable | How to get it |
|---|---|
| `POSTGRES_PASSWORD` | Choose a strong password |
| `DATABASE_URL` | Replace `<same-as-POSTGRES_PASSWORD>` with that same password |
| `LLM_PROVIDER` | `openai` or `gemini` — controls both LLM calls and embeddings |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) — required if `LLM_PROVIDER=openai` |
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) — required if `LLM_PROVIDER=gemini` |
| `CANOPY_API_KEY` | [canopyapi.co](https://canopyapi.co) |
| `ADMIN_PASSWORD` | Choose a strong password |
| `JWT_SECRET` | Run: `openssl rand -hex 32` |
| `FRONTEND_URL` | `http://<ec2-public-ip>` (no trailing slash) |
| `BACKEND_URL` | `http://<ec2-public-ip>` (same value) |

> `POSTGRES_PASSWORD` and the password embedded in `DATABASE_URL` must be identical — the backend and the database both read from this file and must agree.

Save and exit: `Ctrl+X`, `Y`, `Enter`

---

## Step 8: Build and Start

```bash
docker compose up -d --build
```

> The first build takes **5–8 minutes** — it downloads Python dependencies and Playwright/Chromium.

Watch build output:

```bash
docker compose logs -f
```

Press `Ctrl+C` to stop following logs (containers keep running).

---

## Step 9: Monitor Health Checks

```bash
watch docker compose ps
```

Expected final state:

```
NAME                    STATUS
hyve-db-1               Up (healthy)
hyve-redis-1            Up (healthy)
hyve-backend-1          Up (healthy)
hyve-frontend-1         Up
```

The backend has a 30-second `start-period`. Once it's `healthy`, the frontend starts (~30 more seconds).

Press `Ctrl+C` to exit `watch`.

---

## Step 10: Initialize the Database (First Deploy Only)

The app creates all tables automatically on startup. The database starts empty. To load sample data:

```bash
docker compose exec backend python seed.py
```

Skip this step to start with a blank database.

---

## Step 11: Verify the Deployment

From your **local machine** (not the EC2):

```bash
# Full chain: browser → Nginx → FastAPI
curl http://<ec2-public-ip>/api/health
# Expected: {"status":"ok"}

# React SPA is served
curl -s http://<ec2-public-ip>/ | grep "<title>"
# Expected: the app's <title> tag

# SPA client-side routing fallback
curl -o /dev/null -s -w "%{http_code}" http://<ec2-public-ip>/products
# Expected: 200 (not 404)
```

Open `http://<ec2-public-ip>` in a browser — the HYVE app should load and work.

---

## Step 12: Set Up Automated Database Backups

First install `cronie` — Amazon Linux 2023 does not include cron by default:

```bash
sudo dnf install -y cronie
sudo systemctl enable --now crond
```

Create the backups directory and add the cron job:

```bash
mkdir -p ~/backups
crontab -e
```

Add this single line (daily backup at 2am, auto-deletes files older than 7 days):

```
0 2 * * * docker compose -f ~/hyve/docker-compose.yml exec -T db pg_dump -U hyve hyve > ~/backups/hyve-$(date +\%Y\%m\%d).sql && find ~/backups -name "*.sql" -mtime +7 -delete
```

Save and exit, then verify:

```bash
crontab -l
```

---

## Step 13: Enable HTTPS (Let's Encrypt)

Let's Encrypt **cannot issue certificates for raw IP addresses** — you need a domain name. But you don't have to buy one. You have two free options:

| Option | Cost | Browser warning? | Notes |
|---|---|---|---|
| **A — EC2 hostname** (recommended) | Free | None | Use your instance's built-in DNS + Elastic IP |
| **B — Custom domain** | ~$10–15/yr | None | Most flexible |
| **C — Self-signed cert** | Free | Yes (one-time bypass) | Works with raw IP, instant setup |

---

### Option A: EC2 hostname + Elastic IP (free, no domain purchase)

Your EC2 instance already has a valid DNS hostname like `ec2-16-170-225-232.eu-north-1.compute.amazonaws.com`. Let's Encrypt can issue a certificate for it. The only catch is the hostname changes if you stop/start the instance — an Elastic IP fixes that permanently and is free while the instance is running.

**13a-A. Allocate an Elastic IP (one-time)**

In AWS Console → EC2 → Elastic IPs → Allocate Elastic IP address → Allocate.
Then: Actions → Associate Elastic IP → select your instance → Associate.

Your public IP is now static. Your hostname stabilises to `ec2-<ip-dashes>.region.compute.amazonaws.com`.

**13a-B. Note your new stable hostname**

```bash
curl http://169.254.169.254/latest/meta-data/public-hostname
# e.g. ec2-16-170-225-232.eu-north-1.compute.amazonaws.com
```

Use this as `YOUR_HOSTNAME` in the steps below.

---

### Option B: Custom domain

1. In your DNS provider, create an **A record**: `yourdomain.com` → EC2 Elastic IP
2. Optional: also add `www.yourdomain.com` → same IP
3. Wait for DNS to propagate (~5 minutes)

Use `yourdomain.com` as `YOUR_HOSTNAME` below.

---

### 13b. Open port 443 in the security group

AWS Console → EC2 → Security Groups → your instance → Inbound rules → Add rule:
- Type: HTTPS, Port: 443, Source: `0.0.0.0/0`

### 13c. Install certbot

```bash
sudo dnf install -y certbot
```

### 13d. Get the certificate

Stop frontend temporarily so certbot can bind to port 80:

```bash
cd ~/hyve
docker compose stop frontend
sudo certbot certonly --standalone -d YOUR_HOSTNAME
docker compose start frontend
```

The cert is saved to `/etc/letsencrypt/live/YOUR_HOSTNAME/`.

### 13e. Enable HTTPS in the application

```bash
nano ~/hyve/backend/.env
```

Add/update these lines (replace `YOUR_HOSTNAME` with the actual value):
```
DOMAIN=YOUR_HOSTNAME
FRONTEND_URL=https://YOUR_HOSTNAME
BACKEND_URL=https://YOUR_HOSTNAME
```

Update `docker-compose.yml` to expose port 443 and mount the certs:

```bash
nano ~/hyve/docker-compose.yml
```

Find the `frontend:` service and make these changes:
```yaml
frontend:
  build: ./frontend
  ports:
    - "80:80"
    - "443:443"                              # add this
  environment:
    - DOMAIN=${DOMAIN}                       # add this
  volumes:
    - /etc/letsencrypt:/etc/letsencrypt:ro   # add this
  restart: unless-stopped
  ...
```

Rebuild:

```bash
docker compose up -d --build frontend
```

The startup script inside the container detects the cert and automatically switches to the HTTPS nginx config.

Verify:
```bash
curl https://YOUR_HOSTNAME/api/health
# Expected: {"status":"ok"}
```

### 13f. Auto-renew the certificate

```bash
crontab -e
```

Add this line (renewal check twice daily, reloads nginx after):

```
0 0,12 * * * sudo certbot renew --quiet && docker compose -f ~/hyve/docker-compose.yml exec frontend nginx -s reload
```

---

### Option C: Self-signed certificate (raw IP, instant, browser warning)

Use this if you want HTTPS immediately without any domain setup. The browser will show a security warning once — click "Advanced → Proceed" to bypass it.

```bash
# Generate a self-signed cert valid for 1 year
sudo mkdir -p /etc/ssl/hyve
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/hyve/privkey.pem \
  -out /etc/ssl/hyve/fullchain.pem \
  -subj "/CN=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)"
```

Then set `DOMAIN` to a placeholder and point the cert mount to `/etc/ssl/hyve`:

In `backend/.env`:
```
DOMAIN=self-signed
FRONTEND_URL=https://<ec2-public-ip>
BACKEND_URL=https://<ec2-public-ip>
```

In `docker-compose.yml` frontend service:
```yaml
environment:
  - DOMAIN=self-signed
volumes:
  - /etc/ssl/hyve:/etc/letsencrypt/live/self-signed:ro
ports:
  - "80:80"
  - "443:443"
```

Rebuild: `docker compose up -d --build frontend`

---

## Deploying Updates (One-Command Deploy)

A `deploy.sh` script automates the full push → SSH → pull → rebuild cycle.

### Setup (one time only)

```bash
cp .deploy.env.example .deploy.env
nano .deploy.env   # fill in EC2_HOST and SSH_KEY
chmod +x deploy.sh
```

`.deploy.env` contents:
```
EC2_HOST=ec2-user@<your-ec2-public-ip>
SSH_KEY=/path/to/your-key.pem
```

### Deploying

```bash
./deploy.sh           # pushes main and deploys
./deploy.sh my-branch # pushes a specific branch then deploys
```

What it does in order:
1. `git push origin main` — pushes your latest code to GitHub
2. SSHs into EC2
3. `git pull` — pulls the latest code on the server
4. `docker compose up -d --build` — rebuilds changed images and restarts

Docker layer caching keeps rebuilds fast (1–3 minutes unless Python or npm dependencies changed).

---

## Troubleshooting

### Redis `WARNING Memory overcommit must be enabled`

This is a kernel setting, not a Docker issue. Fix it permanently:

```bash
echo 'vm.overcommit_memory = 1' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
docker compose restart redis
```

### `crontab: command not found`

Amazon Linux 2023 does not ship with cron. Install it:

```bash
sudo dnf install -y cronie
sudo systemctl enable --now crond
```

### `compose build requires buildx 0.17.0 or later`

The system buildx is too old. Follow Step 4 to install the latest buildx plugin manually.

### `The "POSTGRES_USER" variable is not set`

Docker Compose is trying to interpolate `$POSTGRES_USER` from the host shell instead of from the container's env. This is a known issue if you have an older version of this repo. Pull the latest code (`git pull`) — the fix (using `$$POSTGRES_USER` in `docker-compose.yml`) is already committed.

### Backend stays `unhealthy`

```bash
docker compose logs backend
```

Common causes:
- `DATABASE_URL` password doesn't match `POSTGRES_PASSWORD`
- Missing required env var (check for lines containing `KeyError` or `ValidationError`)
- DB not ready yet — wait 30 more seconds and re-check

### Port 80 not reachable from browser

Check the EC2 security group has an inbound rule: Type=HTTP, Port=80, Source=`0.0.0.0/0`.

### Out of disk space

```bash
docker system prune -f          # remove unused images and build cache
docker volume ls                # check named volumes
df -h                           # check disk usage
```

### Restore a database backup

```bash
docker compose exec -T db psql -U hyve hyve < ~/backups/hyve-YYYYMMDD.sql
```

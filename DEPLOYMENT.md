# Deploying HYVE to AWS EC2

This guide walks through deploying the full HYVE stack (React + FastAPI + PostgreSQL + Redis) to a single AWS EC2 instance using Docker Compose.

**Architecture:** Nginx (port 80) serves the React SPA and reverse-proxies `/api/*` to FastAPI. PostgreSQL and Redis run as Docker containers with named volumes. Only port 80 and port 22 are exposed publicly.

**Estimated cost:** ~$14–16/month (t4g.small, 30 GiB gp3, us-east-1)

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
| AMI | **Amazon Linux 2023 (ARM64)** — search "Amazon Linux 2023", select the ARM64 variant |
| Instance type | `t4g.small` |
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
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-aarch64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Docker Buildx (required by compose build — system version is too old)
BUILDX_VER=$(curl -s https://api.github.com/repos/docker/buildx/releases/latest \
  | grep '"tag_name"' | cut -d'"' -f4)
sudo curl -SL \
  "https://github.com/docker/buildx/releases/download/${BUILDX_VER}/buildx-${BUILDX_VER}.linux-arm64" \
  -o /usr/local/lib/docker/cli-plugins/docker-buildx
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx
```

Verify both:

```bash
docker compose version   # expect: Docker Compose version v2.x.x
docker buildx version    # expect: github.com/docker/buildx v0.17.0 or later
```

---

## Step 5: Create Swap Space

The t4g.small has 2 GB RAM. Adding swap prevents OOM kills during the Playwright + AI pipeline under concurrent load:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

Expected: `Swap:` row showing `2.0Gi` total.

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

> The first build takes **8–12 minutes** — it downloads Python dependencies and Playwright/Chromium.

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

Daily backup at 2am, auto-deletes files older than 7 days:

```bash
mkdir -p ~/backups
crontab -e
```

Add this single line:

```
0 2 * * * docker compose -f ~/hyve/docker-compose.yml exec -T db pg_dump -U hyve hyve > ~/backups/hyve-$(date +\%Y\%m\%d).sql && find ~/backups -name "*.sql" -mtime +7 -delete
```

Save and exit, then verify:

```bash
crontab -l
```

---

## Updating the Application

After pushing code changes to git:

```bash
ssh -i your-key.pem ec2-user@<ec2-public-ip>
cd ~/hyve
git pull
docker compose up -d --build
```

Docker layer caching makes subsequent builds fast (1–3 minutes unless Python or npm dependencies changed).

---

## Troubleshooting

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

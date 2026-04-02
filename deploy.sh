#!/bin/bash
# =============================================================================
# HYVE — One-command deploy script
# Usage:  ./deploy.sh          (pushes main and deploys)
#         ./deploy.sh my-branch (pushes a specific branch then deploys)
#
# Setup (one time only):
#   cp .deploy.env.example .deploy.env
#   nano .deploy.env           # fill in EC2_HOST and SSH_KEY
#   chmod +x deploy.sh
# =============================================================================
set -e

CONFIG="$(dirname "$0")/.deploy.env"
if [ ! -f "$CONFIG" ]; then
  echo "Error: .deploy.env not found."
  echo "Run: cp .deploy.env.example .deploy.env — then fill in your EC2 details."
  exit 1
fi
source "$CONFIG"

if [ -z "$EC2_HOST" ] || [ -z "$SSH_KEY" ]; then
  echo "Error: EC2_HOST and SSH_KEY must be set in .deploy.env"
  exit 1
fi

BRANCH="${1:-main}"

echo "▶ Step 1/3 — Pushing $BRANCH to GitHub..."
git push origin "$BRANCH"

echo "▶ Step 2/3 — Connecting to $EC2_HOST..."
echo "▶ Step 3/3 — Pulling latest code and rebuilding..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$EC2_HOST" \
  "cd ~/hyve && git pull origin $BRANCH && docker compose up -d --build"

echo ""
echo "✓ Deployment complete."

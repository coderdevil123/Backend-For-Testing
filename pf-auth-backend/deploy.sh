#!/bin/bash

# Deployment script for PF Auth Backend
# Usage: ./deploy.sh

set -e

echo "🚀 Starting backend deployment..."

# Pull latest changes
echo "📥 Pulling latest code from GitHub..."
git pull origin main || echo "⚠️  Git pull skipped (local changes)"

# Stop running containers
echo "🛑 Stopping existing backend containers..."
docker compose down

# Build fresh images
echo "🔨 Building backend Docker images..."
docker compose build --no-cache

# Start containers
echo "▶️  Starting backend containers..."
docker compose up -d

# Status
echo ""
echo "✅ Backend deployment complete!"
echo ""
docker compose ps

echo ""
echo "🌐 Backend is live at:"
echo "➡ http://10.10.10.57:8081"
echo ""
echo "📝 Logs:"
echo "➡ docker compose logs -f"

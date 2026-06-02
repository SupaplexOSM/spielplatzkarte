#!/bin/bash
set -e

REPO_DIR="/vercel/share/v0-project"
cd "$REPO_DIR"

echo "=== Git status ==="
git status

echo "=== Current branch ==="
git branch --show-current

echo "=== Remote info ==="
git remote -v

echo "=== Fetching from origin ==="
git fetch origin

echo "=== Checking out main ==="
git checkout main || git checkout master

echo "=== Pulling latest ==="
git pull origin main || git pull origin master

echo "=== Creating new branch ==="
BRANCH_NAME="feature/sidebar-bright-theme"
git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout "$BRANCH_NAME"

echo "=== Active branch ==="
git branch --show-current

echo "=== Done ==="

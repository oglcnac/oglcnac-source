#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${SOURCE_DIR:-/home/bach/oglcnac-source/frontend}"
DEPLOY_DIR="${DEPLOY_DIR:-/home/bach/oglcnac-static-site}"
COMMIT_MESSAGE="${COMMIT_MESSAGE:-Deploy frontend from oglcnac-source}"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Missing source directory: $SOURCE_DIR" >&2
  exit 1
fi

if [ ! -d "$DEPLOY_DIR/.git" ]; then
  echo "Deployment directory is not a git repository: $DEPLOY_DIR" >&2
  exit 1
fi

rsync -a --delete \
  --exclude '.git' \
  --exclude '.DS_Store' \
  --exclude '__pycache__' \
  "$SOURCE_DIR/" "$DEPLOY_DIR/"

git -C "$DEPLOY_DIR" status --short

if [ -n "$(git -C "$DEPLOY_DIR" status --porcelain)" ]; then
  git -C "$DEPLOY_DIR" add -A
  git -C "$DEPLOY_DIR" commit -m "$COMMIT_MESSAGE"
  git -C "$DEPLOY_DIR" push
else
  echo "No frontend deployment changes."
fi

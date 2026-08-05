#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_REPOSITORY_URL="${DEPLOY_REPOSITORY_URL:-https://github.com/oglcnac/oglcnac.git}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-master}"
COMMIT_MESSAGE="${COMMIT_MESSAGE:-Deploy frontend from oglcnac-source}"
DEPLOY_GIT_NAME="${DEPLOY_GIT_NAME:-$(git -C "$REPOSITORY_ROOT" config user.name || true)}"
DEPLOY_GIT_EMAIL="${DEPLOY_GIT_EMAIL:-$(git -C "$REPOSITORY_ROOT" config user.email || true)}"

if [ -z "$DEPLOY_GIT_NAME" ] || [ -z "$DEPLOY_GIT_EMAIL" ]; then
  echo "Configure git user.name and user.email in the source repository before deployment." >&2
  exit 1
fi

if [ "${SKIP_SOURCE_STATE_CHECK:-0}" != "1" ]; then
  if [ -n "$(git -C "$REPOSITORY_ROOT" status --porcelain --untracked-files=normal)" ]; then
    echo "Source repository must be clean before deployment." >&2
    exit 1
  fi
  SOURCE_SHA="$(git -C "$REPOSITORY_ROOT" rev-parse HEAD)"
  ORIGIN_SHA="$(git -C "$REPOSITORY_ROOT" rev-parse "origin/$DEPLOY_BRANCH")"
  if [ "$SOURCE_SHA" != "$ORIGIN_SHA" ]; then
    echo "Source HEAD must equal origin/$DEPLOY_BRANCH before deployment." >&2
    exit 1
  fi
else
  SOURCE_SHA="$(git -C "$REPOSITORY_ROOT" rev-parse HEAD 2>/dev/null || printf 'test-source')"
fi

WORK_DIRECTORY="$(mktemp -d)"
trap 'rm -rf -- "$WORK_DIRECTORY"' EXIT
BUILD_DIRECTORY="$WORK_DIRECTORY/site"
DEPLOY_DIRECTORY="$WORK_DIRECTORY/deploy"

python3 "$REPOSITORY_ROOT/scripts/build_site.py" \
  --output-root "$BUILD_DIRECTORY"
python3 -S "$REPOSITORY_ROOT/scripts/check_site.py" \
  --forbid-external-runtime \
  --audit-assets \
  --audit-routes \
  "$BUILD_DIRECTORY"

git clone --quiet --branch "$DEPLOY_BRANCH" "$DEPLOY_REPOSITORY_URL" "$DEPLOY_DIRECTORY"
git -C "$DEPLOY_DIRECTORY" config user.name "$DEPLOY_GIT_NAME"
git -C "$DEPLOY_DIRECTORY" config user.email "$DEPLOY_GIT_EMAIL"
rsync -a --delete --exclude '.git' "$BUILD_DIRECTORY/" "$DEPLOY_DIRECTORY/"

if [ -n "$(git -C "$DEPLOY_DIRECTORY" status --porcelain)" ]; then
  git -C "$DEPLOY_DIRECTORY" add -A
  git -C "$DEPLOY_DIRECTORY" commit \
    -m "$COMMIT_MESSAGE" \
    -m "Source-Commit: $SOURCE_SHA"
  git -C "$DEPLOY_DIRECTORY" push origin "$DEPLOY_BRANCH"
  echo "Deployed source $SOURCE_SHA as $(git -C "$DEPLOY_DIRECTORY" rev-parse HEAD)"
else
  echo "No frontend deployment changes for source $SOURCE_SHA."
fi

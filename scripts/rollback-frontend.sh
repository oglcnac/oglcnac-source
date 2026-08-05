#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 DEPLOY_COMMIT" >&2
  exit 2
fi

DEPLOY_COMMIT="$1"
DEPLOY_REPOSITORY_URL="${DEPLOY_REPOSITORY_URL:-https://github.com/oglcnac/oglcnac.git}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-master}"
WORK_DIRECTORY="$(mktemp -d)"
trap 'rm -rf -- "$WORK_DIRECTORY"' EXIT
DEPLOY_DIRECTORY="$WORK_DIRECTORY/deploy"

git clone --quiet --branch "$DEPLOY_BRANCH" "$DEPLOY_REPOSITORY_URL" "$DEPLOY_DIRECTORY"
git -C "$DEPLOY_DIRECTORY" cat-file -e "$DEPLOY_COMMIT^{commit}"
git -C "$DEPLOY_DIRECTORY" merge-base --is-ancestor "$DEPLOY_COMMIT" HEAD
git -C "$DEPLOY_DIRECTORY" revert --no-edit "$DEPLOY_COMMIT"
git -C "$DEPLOY_DIRECTORY" push origin "$DEPLOY_BRANCH"
echo "Reverted deployment $DEPLOY_COMMIT with $(git -C "$DEPLOY_DIRECTORY" rev-parse HEAD)"

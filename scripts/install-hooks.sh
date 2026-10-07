#!/usr/bin/env bash
# 安装 git 钩子：把 scripts/git-hooks/ 下的钩子链接到 .git/hooks/
# 这样任何 agent 或人提交代码时，pre-commit 钩子都会生效。
set -e
cd "$(dirname "$0")/.."
HOOKS_DIR=".git/hooks"
SRC_DIR="scripts/git-hooks"

for hook in "$SRC_DIR"/*; do
  [ -f "$hook" ] || continue
  name="$(basename "$hook")"
  ln -sf "../../$SRC_DIR/$name" "$HOOKS_DIR/$name"
  echo "已安装钩子: $name"
done
echo "完成。"

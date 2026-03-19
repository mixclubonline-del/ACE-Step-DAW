#!/bin/bash
set -e
ISSUE_NUM=$1
TOOL=${2:-"codex"}
REPO="ace-step/ACE-Step-DAW"
DAW="/Users/junmingong/.openclaw/workspace/acestep-daw"
WT="/tmp/daw-worktrees/agent-$ISSUE_NUM"

TITLE=$(gh issue view $ISSUE_NUM --repo $REPO --json title --jq .title 2>/dev/null)
BODY=$(gh issue view $ISSUE_NUM --repo $REPO --json body --jq .body 2>/dev/null | head -80)

# ── STEP A: Fresh worktree from latest main (BASH enforced, not prompt) ──
if [ -n "$WT" ] && [[ "$WT" == /tmp/daw-worktrees/* ]]; then
  rm -rf "$WT"
fi
cd "$DAW"
git fetch origin main 2>/dev/null
git worktree prune 2>/dev/null
git worktree add "$WT" origin/main --detach 2>/dev/null
cd "$WT"
git checkout -B "fix/issue-$ISSUE_NUM" origin/main 2>/dev/null

CONTEXT=$(cat "$DAW/scripts/agents/AGENT_CONTEXT.md" 2>/dev/null)

# ── STEP B: Agent does the coding (prompt) ──
PROMPT="$CONTEXT
---
IMPLEMENT ISSUE #$ISSUE_NUM: $TITLE
Details: $BODY

You are on branch fix/issue-$ISSUE_NUM based on LATEST origin/main.
Implement the feature/fix. Then:
1. npx tsc --noEmit && npm run build && npx vitest run tests/unit/
2. git add -A && git commit -m 'feat: resolve #$ISSUE_NUM — $TITLE'
3. Done. Do NOT push or create PR — the wrapper script handles that."

# ── STEP C: Wrapper handles push + rebase + PR (BASH enforced) ──
# This runs AFTER the agent exits, guaranteeing rebase happens
WRAPPER="#!/bin/bash
cd $WT

# Run the coding agent
if [ '$TOOL' = 'codex' ]; then
  codex exec -C $WT -s danger-full-access \"$PROMPT\"
else
  $HOME/.local/bin/claude --print --permission-mode bypassPermissions \"$PROMPT\"
fi

# ENFORCED: rebase onto latest main before push
cd $WT
git fetch origin main 2>/dev/null
git rebase origin/main 2>/dev/null || {
  # If rebase fails, try to abort and just force the current state
  git rebase --abort 2>/dev/null
  echo 'WARN: rebase failed, pushing current state'
}

# ENFORCED: push
git -c user.name=ChuxiJ -c user.email=junmin@acestudio.ai push origin fix/issue-$ISSUE_NUM --force 2>/dev/null

# ENFORCED: create PR
gh pr create --repo $REPO --title 'feat: #$ISSUE_NUM — $TITLE' --body 'Closes #$ISSUE_NUM' --base main --head fix/issue-$ISSUE_NUM 2>/dev/null || true
"

echo "$WRAPPER" > "$WT/run-agent.sh"
chmod +x "$WT/run-agent.sh"
nohup bash "$WT/run-agent.sh" > "/tmp/daw-worktrees/agent-$ISSUE_NUM.${TOOL}.log" 2>&1 &
echo "$TOOL-$ISSUE_NUM: PID $!"

---
name: nvim
description: Open a Neovim instance in a sibling Zellij pane scoped to Claude's current working directory. Use whenever the operator wants to edit a file you've been working with, or just wants a shell + editor inside the same worktree. Right-split pane. Auto-invoke when the operator asks to "open in nvim" / "edit in nvim" / "give me an editor" / similar.
---

# nvim — open a Neovim pane in Claude's working directory

Spawns a new Zellij pane, `cd`s to the Claude session's `$cwd` (or an explicit path argument), and launches `nvim`. Right-split, full height, named so it's easy to find.

## Auto-invoke when the operator

- says "open it in nvim" / "открой в нвиме" / "edit this in nvim"
- says "give me an editor here" / "дай редактор"
- types `/nvim` or `/nvim <path>` explicitly
- has just asked to inspect or hand-edit a file you've been touching in the same worktree

Skip when:

- the session isn't inside Zellij (`$ZELLIJ` unset) — without it, `zellij action` has no host to talk to
- `nvim` isn't on PATH (rare on this host but possible)
- the operator wants you to make the edit yourself — don't pop an editor instead of using `Edit`/`Write`

## Canonical command

```bash
zellij action new-pane --direction right --cwd "<absolute-cwd>" --name nvim -- nvim <target>
```

- `<absolute-cwd>` is Claude's current working directory (`pwd`), NOT the user's. The whole point: the pane lands in the same worktree you're working in.
- `<target>` is **always required**:
  - No path argument from the operator → pass `.` so nvim opens the directory (netrw / file explorer) rooted at the worktree, NOT an empty buffer.
  - Operator-supplied path → pass it as-is. Relative paths Just Work because the pane's `--cwd` is set.
- `--direction right`: full-height split next to whichever pane Claude is running in.

## Workflow when the operator asks to open nvim

1. Resolve the target:
   - No argument → `nvim .` in the worktree.
   - Relative path → pass straight to nvim; the pane's cwd is set.
   - Absolute path → pass through.
2. Verify the pre-conditions: `$ZELLIJ` is set, `command -v nvim` resolves.
3. Run the Zellij action (one shot, no streaming). Don't `await` blocking — the pane lives until the operator closes it.
4. Confirm with one short line: "Opened nvim in `<cwd>`" (and the filename if provided).

## When `$ZELLIJ` is unset

The skill doesn't apply. Tell the operator:

> Not inside Zellij (`$ZELLIJ` unset), so I can't spawn a sibling pane. Open nvim yourself in another terminal at `<cwd>`, or attach a Zellij session first.

Do not try `nvim` directly via Bash — it would attach to Claude's stdio and lock the session.

## Floating pane variant

Operator may ask for a floating pane instead of a split (matches the `MARKDOWN_VIEW_PANE=floating` shortcut). When they do:

```bash
zellij action new-pane --floating --cwd "<absolute-cwd>" --name nvim -- nvim <target>
```

(`<target>` follows the same rule as above — default `.`, otherwise the path.)

## Don't

- Don't fire `nvim` directly from the Bash tool without `zellij action new-pane` — it ties up Claude's terminal until nvim exits, which means no further tool calls.
- Don't pop a pane from a NON-worktree shell when Claude is operating inside a worktree. The target cwd is always Claude's `$cwd`, not the user's home, not the repo root.
- Don't ask the operator to type the zellij command themselves. The whole point of the skill is that you run it for them and they land in the editor.
- Don't loop multiple panes per request. One `/nvim` invocation = one new pane. If they want a second file open later, they can either `:e` inside the existing nvim or invoke `/nvim` again.

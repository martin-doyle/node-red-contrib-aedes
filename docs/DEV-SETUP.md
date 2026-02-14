# Developer Setup Note

After every `npm install` or `npm update`, re-link Node-RED:

```bash
sudo npm link node-red
```

`npm install` resets the `node_modules` directory and removes the symlink created by `npm link`. Without re-linking, the test helper cannot find Node-RED and tests will fail.

---

## Backporting a fix to a legacy branch

```bash
# 1. Stash any WIP on current branch
git stash push -m "WIP before backport"

# 2. Switch to the legacy branch
git checkout v0.15.x           # or: git checkout v11

# 3. Cherry-pick the fix commit from the source branch
git cherry-pick <commit-hash>  # resolve conflicts if any

# 4. Run tests
npm test

# 5. Bump patch version and commit
npm run patch                  # bumps version in package.json (no git tag)
git add -A
git commit -m "Bump patch version"

# 6. Publish to npm (optional, with appropriate tag)
npm publish --tag <tag>        # e.g. --tag legacy or --tag v11

# 7. Return to working branch and restore WIP
git checkout <working-branch>
git stash pop
```

Notes:
- Find the commit hash with `git log --oneline <source-branch>`.
- If the cherry-pick has conflicts, resolve them, then `git cherry-pick --continue`.
- `npm run patch` runs `npm --no-git-tag-version version patch` — it bumps the patch version in `package.json` without creating a git tag.
- Use `--tag <tag>` with `npm publish` to avoid overwriting the `latest` tag on npm. Choose a tag that matches the branch (e.g. `legacy`, `v11`).

### Example: Backport Tasks 6 and 7.1

Each fix you want to backport needs its own separate commit on the source branch.

```bash
# 1. Commit each fix separately on the source branch
git add aedes.js
git commit -m "Fix: add removed parameter to close handler"    # Task 7.1

git add aedes.js
git commit -m "Fix: iterate subscribe/unsubscribe arrays"      # Task 6

# 2. Find the commit hashes
git log --oneline migrate-aedes-v1

# 3. Backport to v0.15.x
git stash push -m "WIP before backport"
git checkout v0.15.x
git cherry-pick <Task-7.1-commit>  # close handler: add removed parameter
git cherry-pick <Task-6-commit>    # fix subscribe/unsubscribe event handlers
npm test
npm run patch
git add -A && git commit -m "Bump patch version"
npm publish --tag v0.15.x
git push origin v0.15.x

# 4. Backport to v11
git checkout v11
git cherry-pick <Task-7.1-commit>  # close handler: add removed parameter
git cherry-pick <Task-6-commit>    # fix subscribe/unsubscribe event handlers
npm test
npm run patch
git add -A && git commit -m "Bump patch version"
npm publish --tag v11
git push origin v11

# 5. Return to working branch
git checkout migrate-aedes-v1
git stash pop
```

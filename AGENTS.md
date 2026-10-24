# Repository workflow

The user requires this workflow for every change:

1. Fetch `upstream` and create a new feature/fix branch from the current `upstream/main`. Never work directly on `main`.
2. Preserve existing work, implement the change and run the relevant tests and build.
3. Commit and push the branch to the user's fork with `git push -u origin <branch>`. The user creates the pull request from `webiumsk/community-api` against `main` in `dvadsatjeden/community-api`; do not create it on their behalf.
4. Wait for CI and CodeRabbit to finish reviewing the **latest head commit**. Inspect review comments and unresolved threads as well as the check summary. A skipped, failed, rate-limited or absent review is not a clean review.
5. Address actionable findings, push fixes and wait for the new checks/review. Do not dismiss or ignore findings just to merge.
6. The user merges the PR after CI passes and CodeRabbit has no outstanding actionable findings. Do not merge it on their behalf.
7. After verifying that the user has merged the PR, deploy the reviewed result and verify the deployed version. Keep a rollback image.

`origin` is the user's fork, `webiumsk/community-api`. `upstream` is the project repository, `dvadsatjeden/community-api`. Push feature/fix branches to `origin`; do not push them directly to `upstream`. `git push -u origin <branch>` sets branch tracking and is separate from the remote named `upstream`.

Never commit `.env`, credentials, runtime databases, backups, generated distributions or release ZIPs. Keep Node.js 24 and both package lockfiles consistent. The application uses a dark black/orange Bitcoin interface with factual Slovak copy; do not replace it with a light or editorial theme.

Architecture, run commands and deployment are documented in README.md, docs/OPERATIONS.md and docs/CONTRIBUTING.md.

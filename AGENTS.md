# Repository workflow

The user requires this workflow for every change:

1. Create a new feature/fix branch from the current `origin/main`. Never work directly on `main`.
2. Preserve existing work, implement the change and run the relevant tests and build.
3. Commit and push the branch, then open a pull request against `main` in `dvadsatjeden/community-api`.
4. Wait for CI and CodeRabbit to finish reviewing the **latest head commit**. Inspect review comments and unresolved threads as well as the check summary. A skipped, failed, rate-limited or absent review is not a clean review.
5. Address actionable findings, push fixes and wait for the new checks/review. Do not dismiss or ignore findings just to merge.
6. When CI passes and CodeRabbit has no outstanding actionable findings, merge the PR. The user has authorized this conditional merge; do not ask again for routine approval.
7. Deploy the reviewed result after merge and verify the deployed version. Keep a rollback image.

`origin` is the project repository, not a fork. `git push -u origin <branch>` sets the branch's tracking upstream; a separate remote named `upstream` is not needed for the current setup.

Never commit `.env`, credentials, runtime databases, backups, generated distributions or release ZIPs. Keep Node.js 24 and both package lockfiles consistent. The application uses a dark black/orange Bitcoin interface with factual Slovak copy; do not replace it with a light or editorial theme.

Architecture, run commands and deployment are documented in README.md, docs/OPERATIONS.md and docs/CONTRIBUTING.md.

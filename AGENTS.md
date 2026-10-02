# DeuceLeague agent instructions

Read and follow [CLAUDE.md](CLAUDE.md); it is the canonical repository guide.

## Generated API documentation

`docs/openapi.json` and `docs/api.html` are generated artifacts. Do not edit
them by hand. After changing an API contract, route, or its OpenAPI output, run
`npm run docs:openapi` and commit both generated files. Run `npm test` before
handoff: it fails if either file has drifted from the API route definitions.

### Post-PR Review Protocol

After opening a Pull Request, your task is not complete until you have monitored it for reviewer feedback. Stay active and periodically check the PR status for the next 10 minutes using whatever tools you have available (e.g., GitHub CLI, API, or terminal scripts).

Your objectives during this window:

* **On Approval (or a 👍 comment):** Automatically merge the PR.
* **On Feedback / Requested Changes:** Read the comments, modify the code to address them, push your updates, and ask for a re-review.
* **On Timeout:** If 10 minutes pass with no review activity, conclude the task and exit naturally.

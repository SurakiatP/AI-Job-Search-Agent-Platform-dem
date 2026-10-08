# AI Job Search Agent Platform

A local, project-scoped workspace for preparing a supplied CV and job posting, evaluating their fit, and drafting application documents. The first workflow does not search Thai job boards automatically and does not submit applications. An owner reviews and submits drafts manually.

The browser app and backend run on your machine. Model requests go to the provider selected for the project; a local backend does not mean local inference. The supported settings are OpenAI, Anthropic, and OpenRouter. On macOS, provider credentials are stored in Keychain. CV content needed for a request is sent to that selected provider. Never put a provider key in browser storage, a shell command, or a repository file.

## Start here

See [local operation](docs/engineering/local-operation.md) for pinned setup, local storage, owner access, provider configuration, project sharing, verification, and recovery instructions. The local app binds to `127.0.0.1:8000` by default. LAN sharing is an explicit second listener and uses project grants.

## Verification and security

[Security verification](docs/engineering/security-verification.md) describes the checks CI can run and the additional native, storage, and image scans required on an operator machine. The latest recorded full scan and its scope limits are in [dependency evidence](docs/engineering/dependencies.md). CI does not deploy or publish artifacts.

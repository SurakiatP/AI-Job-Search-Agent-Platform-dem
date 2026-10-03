# Hermes native runtime proof (CORE-03)

This is a functional offline proof using the actual pinned Hermes implementation,
its registry/file/terminal tools, the Career Ops router, and native PDF/DOCX
exporters. It is not evidence of a live provider run or a clean release security
gate. Provider smoke testing remains dependent on owner configuration through
Settings in CORE-08/UI-04; no real key was requested or inspected during this proof.

## Verified sources and runtime

Full Git trees are stored outside the application workspace, with write bits
removed from tracked files. Startup rejects the wrong HEAD and any tracked,
untracked, or ignored changes. Setup also rejects submodules. Skill-only copies
are not used.

| Source | Immutable revision | Files | Tree SHA256 |
| --- | --- | ---: | --- |
| NousResearch/hermes-agent | `c8301ea6c9b797184df16a9c5dd462400b264ff4` | 17163 | `f3935818fa7365c32ab62789a9e58342d41dcefc166a2cf813f1a095e9f7a597` |
| career-ops-hq/career-ops | `c1d0d1f3229daad3f2f5a7a4e46c9b256db51ea7` | 1764 | `3896a3f55d701ac1f5dd7ca50bfd6c336b908f33ce5e61cddd0629d19ca01f85` |
| rubicon/career-ops-plugin-docx (owner-approved MIT exporter) | `9252dc84c09dbb597c995190b82322109cf84805` | 37 | `3e223c2dbf71750b3ece44de4e1701ffe1c53fd4e9743dd13bfe861747616f3b` |

The tree digest hashes each sorted tracked relative filename followed by its
bytes; it does not claim to replace Git commit verification. Actual directories
are in `~/.cache/job-search-platform/upstream/<name>-<revision>`.

Authoritative native Python environment:
`~/.cache/job-search-platform/hermes-environment`, Python **3.14.7**.
`setup.py` copies `infra/hermes/{pyproject.toml,uv.lock,.python-version}` byte for
byte and runs `uv sync --locked` there. It does not modify upstream manifests.
Runtime dependencies follow the upstream core manifest, with the compatible
security override **PyJWT 2.15.0**; both 2.13.0 and 2.14.0 had advisories.
No optional Hermes extras are installed. The separate backend uses Python 3.12.
The upstream Hermes `uv.lock` is retained unchanged with SHA256
`de17d70bc999fb0f8fe50dbf8590ac979f43b5a84cd8320caeac1c695ce63c01`;
the installed core environment uses the separate lock below. Upstream Node lock
SHA256 is `9934677654ce672900b0946898cc28c73671f75896862b5768c24cca84776ccd`.
The DOCX plugin's upstream lock SHA256 is
`1814b7731633b605399eac04ea8ff8ee0cdc0fb1dc4da9400f709ab2774d5152`.
Career Ops has no root Node lock; its runtime dependency subset is locked below.

The native Node manifest/lock live in `infra/hermes`, and are copied to
`~/.cache/job-search-platform/hermes-image-build`. They are not inside the native
Python environment. Direct Node runtime dependency versions are exact; install
uses `npm ci --ignore-scripts`. DOCX export uses only the Node standard library.
The final external build context contains 1809 files. Its canonical sorted
relative-filename-plus-bytes SHA256, excluding generated `image-id`, is
`79b097a3430defbc30ff1242148755851b2c58f0db2de6dd99bc5e92968b985f`.
Each copied build input's bytes match the workspace hashes below.

| Build input | SHA256 |
| --- | --- |
| `infra/hermes/uv.lock` | `5ea23a2ed43cfbf038a288f8953f5d84919861b261bccd4b30ac2b0de7816383` |
| `infra/hermes/package-lock.json` | `12f8fb81bd85adedbee724fb6728cbf120e96ca171bbd663e32b0788bf6ae469` |
| `infra/hermes/parser-requirements.txt` | `9e148a56b689cb0d2e79843f538020686e435b3dfeb98972bd0a481e37126bf3` |
| `infra/hermes/Dockerfile` | `32e0d3706c979545dd4a8fabb4505a675143e86b32a511d7debd2343c3f0860e` |
| `infra/hermes/export_pdf.mjs` | `b2d07c6f88bf613b76aa50b633cf0c90bc66329f566f976da085eba8437ca46e` |
| `infra/hermes/parse_document.py` | `044f14c68d82249d1e594ceb9f108a8f6a233bd6ae7092023c8335b2904950c2` |

Final execution image:
`sha256:1a60a423cfc2ca2b60ae2d2250f3be357cbf32714394c354e1df7b1a3836aae6`.
The tag `job-search-platform-hermes:core-03` is a convenience only; the adapter
requires an immutable image digest.

Base images are pinned:

- Python 3.14.7 slim Trixie:
  `sha256:51dafde81dbdb6ebde285137a295cf18a47ca95234fe388a343719cb97305b3d`.
- Node 24.18.0 bookworm slim (build-stage binary only):
  `sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d`.

Runtime browser: `/usr/bin/chromium`, **154.0.8037.92**, Debian package
`154.0.8037.92-1~deb13u1`. There is no downloaded Playwright browser in the final
image. The PDF wrapper calls the real upstream `renderHtmlToPdf`, injecting its
supported `launchBrowser` hook with this executable. The SBOM inventories the
dpkg browser components. ripgrep is pinned to `14.1.1-1+b4`, pcre2 to
`10.46-1~deb13u3`, and OpenSSL packages to `3.5.7-1~deb13u3`.
Unused npm/npx and pip tooling is removed from the final image after installation.

## Native boundary and sandbox

`HermesRuntime` provides typed async `start_project`, `submit`, `events`, `stop`,
`health`, and `close` methods. Each Project has one separate trusted native
process. `submit` takes an explicit platform Session UUID; it does not use native
latest-session recovery and calls `run_conversation` with an empty native history.
Platform context/history remains the caller's responsibility.

The private bridge imports the actual pinned `AIAgent`, checks constructor fields
and `run_conversation`, `interrupt`, and `close`, then dispatches native registry
tools. `skill_view("career-ops", preprocess=False)` loads the actual router from
the immutable checkout via the Project's private skill link.

Enabled model tools are exactly `terminal`, `read_file`, `write_file`, `patch`,
and `search_files`. Registry dispatch filters all other tools and rejects hidden
host-local/force/persistence arguments. Private diagnostic `tool` RPC is not an
HTTP, MCP, or A2A route and must never be exposed by the backend.

Two upstream conveniences are overridden inside the trusted bridge:

- `_readonly_skill_mount_args` returns no implicit attachment/composer/home cache
  mounts. Only explicit Project workspace and selected input snapshots are mounted.
- `_read_extracted_document` refuses document extraction on the host. PDF/DOCX
  parsing is performed only by the narrow container parser below.

These are deliberate native integration hooks, not changes to upstream sources.
An upstream upgrade must reprove them and the native interface.

Containers have no network, host sockets, credentials, host home mounts, or privileged
mode. They run with a non-root host UID, no added capabilities and cap-drop ALL,
`no-new-privileges`, 1 CPU, 512 MiB memory, and a **256 PID** limit. The image root
filesystem is read-only. `/tmp` is bounded to 128 MiB with noexec/nosuid/nodev,
`/var/tmp` to 32 MiB with the same flags, and shared memory to 128 MiB. Native
ephemeral home/run tmpfs mounts remain inside the same memory cgroup. The trusted
bridge overrides `_BASE_SECURITY_ARGS` because native defaults otherwise add
DAC_OVERRIDE/CHOWN/FOWNER. The own Project workspace
is writable; `inputs/` is mounted separately read-only. Workspace paths must be
inside a configured trusted workspace root, and overlapping Projects are rejected.
Workspace and private state/home/process-home/skills/input directories are 0700;
existing permissive directories are tightened only within those trusted roots.
Directory symlinks escaping those roots are rejected before chmod.

The trusted process gets a controlled environment and fresh HOME/HERMES_HOME before
any native import. Provider configuration travels over private stdin RPC;
`ProviderConfig.api_key` is excluded from repr. It is never placed in the tool
environment, command line, model prompt, or a public event. Native callbacks emit
generic progress. Result text remains a private value requiring validation before
publication by CORE-08.

Actual cleanup uses `tools.terminal_tool_lifecycle.cleanup_vm(task_id,
force_remove=True)`. The adapter independently removes containers scoped by
Project, task, and unique runtime-instance labels, even when the bridge RPC dies.
EOF/invalid native responses reject pending requests and wake event consumers with
`native_connection_closed`. Error codes and response text are bounded/type checked.
An entirely killed backend still needs supervisor/startup orphan reconciliation;
this proof covers native bridge death while the adapter remains alive.

## Document operations for CORE-05/08

`parse_input(project_id, "inputs/<snapshot>")` returns
`ParsedInput(text, kind, sha256)`. It invokes the same declared native converter
`anydoc.to_markdown_bytes(..., ocr="reject")` inside the execution container.
Pasted UTF-8 text, text-bearing English/Thai PDF, and DOCX are supported. Inputs are
limited to 20 MiB; DOCX expansion to 100 MiB, 1000 entries, and ratio 100; extracted
text to 1 MiB. Unsupported, encrypted, malformed, and empty inputs return stable
errors. Image-only PDFs return `scanned_pdf_unsupported`; no OCR or network fallback
is attempted. Magic bytes identify PDF/DOCX rather than trusting their filename.

`export_document(project_id, format, source, output)` accepts relative `staging/`
paths and returns the output path. Native invocations are:

```text
node /opt/runtime/export_pdf.mjs /workspace/staging/cv.html /workspace/staging/cv.pdf
node /opt/career-ops-docx/bin/generate-docx.mjs /workspace/staging/cv.md /workspace/staging/cv.docx
```

The first delegates to Career Ops' exported native PDF renderer. Full immutable
Career Ops code is at `/opt/career-ops`; writable data root is `/workspace` through
`CAREER_OPS_ROOT`. Packaged Noto Sans Thai bytes are embedded in proof HTML, so
Thai rendering works offline. CORE-08 must still enforce validated publication:
realpath/no-symlink checks, checksum, file type/size, and output policy. This proof
does not authorize publishing arbitrary native output.

## Verification and security status

`rtk proxy python3 scripts/prove_hermes.py --offline` runs an actual native proof
with synthetic fixtures only. A child host environment contains a synthetic key
sentinel; native tool environment output must contain neither its name nor value.
No real provider configuration is read. The proof verifies:

- Two independent Projects and actual native read/write/patch/search/terminal calls.
- Denial of the other Project, host paths, traversal, socket paths, hidden host
  options, and mutation of selected read-only input snapshots.
- Router loading, interface health, resource/network/user/mount configuration.
- Native English and Thai PDF/DOCX creation and parsing, embedded PDF FontFile2 and
  ToUnicode mappings, and refusal of a real image-only scanned PDF.
- Genuine native stop of background execution and removal of its tool container.
- Killing the real bridge during background execution, event failure delivery,
  then independent removal of the orphan container.

Verified on 2026-10-03:

| Command/scope | Result |
| --- | --- |
| Backend integration pytest | 5 passed in 49.88 s; includes actual native offline subprocess |
| Standalone offline proof after final sandbox hardening | PASS; full native tools/export/parser/stop/crash proof on final image |
| Boundary/private-directory tests after final hardening | 4 passed, native subprocess deselected to avoid duplicate run |
| Native Python `pip-audit` against installed locked environment | No known vulnerabilities |
| Native Node `npm audit --package-lock-only --audit-level=low` | 0 vulnerabilities |
| `uv lock --check --project infra/hermes` | PASS |
| Final execution image, Trivy OS/Node/Python | **69 High + 1 Critical OS; 0 High/Critical Node/Python** |
| Verified anydoc release Cargo.lock, Trivy Cargo detector, all severities | 0 findings |
| Python source syntax/owned-file whitespace | PASS |

Trivy version is 0.75.0; DB updated **2026-10-03 07:01:46 UTC**. Image scan created
at 2026-10-03 23:47:10 Asia/Bangkok. Local detailed scan files and SBOM under
`~/.cache/job-search-platform` are `hermes-native-audit.json`,
`hermes-image-trivy-final.json`, `hermes-image-sbom.cdx.json`, and
`hermes-parser-source-trivy.json`. They contain package metadata and synthetic
proof information, not real CVs or provider keys. The final CycloneDX SBOM SHA256
is `23ed0497d99fdcb81a01fcf4e904559ea4feb6c2cfe2692e40dacad88c265362`;
its Debian components explicitly include chromium and chromium-common 154.0.8037.92.

Release security remains blocked by unresolved High/Critical distro advisories.
The adapter's no-network/non-root/resource isolation reduces impact but does not
make those packages patched or count as a security waiver. No advisories are
ignored and no gate is weakened. Native Python and Node package audit results are
scoped to installed/locked runtime dependencies.

Remediation changed Debian Bookworm to Trixie, replaced the downloaded browser with
the distro browser, removed unused npm/pip build tools, updated native PyJWT, and
applied all available pcre2/OpenSSL fixed packages. Image High/Critical entries
fell from 107 (90 OS + 13 Node + 4 Python) to 70 OS only. The remaining entries have
no fixed Debian version in the recorded DB. Reachability is not waived:

| Remaining group | Exposure and interpretation |
| --- | --- |
| libxml2, including Critical CVE-2026-6653 | Installed library available to arbitrary sandbox commands; not listed by Chromium's `ldd`, but that is insufficient to prove all exploitation paths unreachable. |
| expat, X11, systemd, libmount/util-linux, libsndfile | Several are actual Chromium dynamic dependencies, confirmed with `ldd`; browser/document inputs remain untrusted. |
| ncurses, ACL, TIFF, CUPS, Perl, xdg-utils and related system packages | Present in the image; package-level findings require advisory-specific review. No unused/unreachable assertion is made. |

Mitigations are the verified read-only image, bounded noexec scratch, no added
capabilities, non-root UID, no-new-privileges, PID/CPU/memory limits, isolated
Project mounts, no network/sockets/provider secrets, and teardown. These reduce
exposure and resource impact but do not patch vulnerabilities. **Release security:
FAIL** until fixes or an explicit owner-reviewed disposition under the existing
release policy. Re-review date: **2026-10-10**, or sooner when a fixed distro
package becomes available; this date is documentation, not a scheduled automation.

`firecrawl-anydoc==0.2.4` includes a Rust `_anydoc.abi3.so` extension. The official
wheel is hash pinned; Python release advisory scanning does not inventory embedded
Rust crate dependencies. `infra/hermes/acquire_parser_source.py` acquires the exact
0.2.4 PyPI sdist, verifies its hash, rejects unsafe archives, and checks every
existing source file against that archive before source inventory scanning.

- Image's arm64 manylinux wheel SHA256:
  `17720ba093820654162891d7995fd2dbae948b16fe1c174ba799bddfc0b92ad6`.
- PyPI sdist SHA256:
  `3e29460272fea81cde08fd5af11f6b0f1ff05919214ddc939867f72362c83032`.
- Release source tree SHA256:
  `497ee4fa3fcb7f0567270f8548a6feb0c110ff580c8c88b54f858be5d8e3a4fa`.
- Release Cargo.lock SHA256:
  `7faf5b93ab3d496d848556be84eda6def764a18f50e4de39298847b612980d26`.

The source is under `~/.cache/job-search-platform/parser-source/firecrawl_anydoc-0.2.4`;
the manifest records its release mapping. Trivy recognizes and scans that actual
Cargo.lock with zero advisories at the recorded DB version. This is a **release
source dependency inventory, not an attestation that the published wheel was
compiled from those exact bytes**. A clean pip/Cargo scan must not be presented
as reproducible-build or complete binary assurance.

## Isolated distro remediation follow-up, 2026-10-04

The authoritative image/environment and runtime adapter/bridge/proof scripts were
left unchanged while investigating the remaining OS advisories. An isolated build
retained the same pinned base images, full source trees, locked Node/parser inputs,
Chromium, and fonts, then applied all available Trixie, Trixie updates, and Trixie
security upgrades. Apt reported **0 upgraded, 0 newly installed, 0 to remove, and
0 not upgraded**. Current stable package candidates equal installed versions for
libxml2, systemd, expat, TIFF, X11, sndfile, and util-linux.

Candidate tag: `job-search-platform-hermes:core-03-remediation-trixie`; immutable ID:
`sha256:a8819446adb4003bef147e60f4a7826d3ab6379b2c8d98591574f75e4f0d8fcc`.
The baseline and candidate have identical exact dpkg inventories, SHA256
`ea68a0db6186a76deeba787e57754d27aa4b029a2bffff838de9abbd9095051c`.
Trivy scanned the candidate at **2026-10-04 00:16:05 Asia/Bangkok**, again reporting
**69 High + 1 Critical OS, zero High/Critical Node/Python, no available fixed OS
versions**. The candidate is not promoted; it provides no security improvement.

An isolated actual native runtime smoke test against that candidate passed the
five native tools and router loading, Thai PDF/DOCX export and container parsing,
and native stop. It used synthetic content and made no provider call. This does
not replace the root agent's independent full functional proof on the authoritative
image, which separately passed all five integration tests.

Concrete vendor evidence:

- [Debian CVE-2026-6653 tracker](https://security-tracker.debian.org/tracker/CVE-2026-6653)
  lists Bookworm and Trixie libxml2 as vulnerable. Trixie's version is
  `2.12.7+dfsg+really2.9.14-2.1+deb13u3`; Debian marks the issue `no-dsa`/minor.
  Testing/unstable `2.15.4+dfsg-1` is fixed; the first unstable fix is
  `2.14.5+dfsg-0.1`. The upstream fix is commit
  `463bbeeca1805b5c4828f50d0fefc4eebaf620df` (libxml2 v2.11.0).
- [Debian CVE-2026-78408 tracker](https://security-tracker.debian.org/tracker/CVE-2026-78408)
  lists Trixie util-linux `2.41.5-0+deb13u1` as vulnerable and `no-dsa`/minor.
  Sid `2.42.4-1` is fixed; testing `2.42.3-1` is still vulnerable. This advisory
  concerns a privileged operator's `nsenter --join-cgroup`, whose prerequisites
  are constrained by the verified non-root/no-capability container. That is
  mitigation evidence, not an advisory suppression or release waiver.
- An apt removal simulation for libxml2 removes Chromium, GTK, shared-mime-info,
  and Mesa dependencies. Removing the library is incompatible with the required
  native exporter; no purge was executed. It remains reachable through installed
  browser/system package dependencies and arbitrary sandbox commands, even though
  it is not listed directly in Chromium's `ldd` output.

The next compatible release path is a vendor-patched **Trixie** package set,
including a libxml2 fix that preserves the current ABI and Chromium dependency
closure, followed by the existing native proof and fresh image scan. No such
stable candidate is available at this check. Mixing Sid libraries into the stable
image is not an established compatible remedy and was not adopted. A deliberate
rebase to a supported patched distro would require its own pinned build and full
native compatibility/security evidence; changing the scanner's distro identity
or omitting findings is not a remedy. Release security remains **FAIL**.

Exact sanitized scan/provenance and vendor pages are retained outside Git under
`~/.cache/job-search-platform/hermes-remediation-evidence-20261004`, including
`candidate-trivy.json`, `candidate-provenance.json`, `candidate-image-inspect.json`,
`candidate-summary.json`, both exact dpkg inventories, `candidate-compatibility.json`,
`stable-policy-and-simulations.txt`, and saved Debian tracker HTML. The isolated
build context is `~/.cache/job-search-platform/hermes-remediation-20261004`.

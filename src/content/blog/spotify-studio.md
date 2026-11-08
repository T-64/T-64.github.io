---
title: "What's inside Spotify's AI agent app"
description: "Unpacking Studio by Spotify Labs: a desktop wrapper around the open-source pi coding agent, running on Claude Sonnet 4.6 with 32 custom tools."
pubDate: 2026-11-08
---

In May, Spotify released [Studio by Spotify Labs](https://newsroom.spotify.com/2026-05-21/studio-by-spotify-labs-launch/), a macOS research preview built around a personal AI agent. If you let it, it reads your listening history, Google Calendar, and Gmail, and uses them to generate custom playlists and private podcasts.

Curious about how Spotify puts an agent like this together, I installed the app on my Mac.

The biggest surprise is that Spotify didn't write the core agent loop. Studio runs [pi](https://github.com/badlogic/pi-mono)—Mario Zechner's minimal open-source coding agent—shipped unmodified and hooked up to Claude Sonnet 4.6. Spotify's actual engineering lives in a custom pi extension that exposes 32 tools, wrapped in a local orchestration layer and a macOS sandbox.

I looked at app version `1.2.99.311` (internal build `0.13.6`, built 28 August 2026).

## What's running

With Studio open, `ps` shows two Node services alongside a native binary:

```
Resources/studio/node  Resources/studio/sc-orchestrator.cjs start
Resources/studio/node  Resources/studio/sc-gateway.cjs
MacOS/spotify_cli      permissions watch --format json
MacOS/spotify_cli      chat watch <conversation-id> --format json
```

I wasn't sure what the `sc-` prefix stood for. So I ran `spotify_cli version`:

```
cli: 1.2.99.311
super-connect: v0.13.6
save-to-spotify: 0.1.5
```

"Super Connect" appears to be the internal codename. The workload splits cleanly across the three processes: `sc-orchestrator` manages agent sessions and schedules, `sc-gateway` acts as the local backend for the desktop UI and proxies LLM requests, and `spotify_cli` handles anything that touches your Spotify account. (The UI itself is built on the Chromium Embedded Framework, the same as Spotify's regular desktop app.)

<figure class="fig">
<svg viewBox="0 0 640 384" role="img" aria-label="Process diagram of Studio by Spotify Labs">
<defs><marker id="a1" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" class="ah"/></marker></defs>
<rect x="230" y="8" width="180" height="40" rx="3"/><text x="320" y="33" text-anchor="middle">Desktop UI (CEF)</text>
<path d="M320 48V110" marker-end="url(#a1)"/><path d="M260 48C260 84 110 74 110 110" marker-end="url(#a1)"/>
<rect x="20" y="110" width="180" height="56" rx="3"/><text x="110" y="134" text-anchor="middle">sc-gateway</text><text x="110" y="153" text-anchor="middle" class="m">local API · model proxy</text>
<rect x="230" y="110" width="180" height="56" rx="3"/><text x="320" y="134" text-anchor="middle">sc-orchestrator</text><text x="320" y="153" text-anchor="middle" class="m">sessions · routines · skills</text>
<rect x="440" y="110" width="180" height="56" rx="3"/><text x="530" y="134" text-anchor="middle">spotify_cli</text><text x="530" y="153" text-anchor="middle" class="m">native · account access</text>
<path d="M320 166V214" marker-end="url(#a1)"/>
<rect x="230" y="214" width="180" height="72" rx="3" class="f"/><text x="320" y="238" text-anchor="middle">pi --mode rpc</text><text x="320" y="257" text-anchor="middle" class="m">one per agent session</text><text x="320" y="275" text-anchor="middle" class="m">+ Spotify extension</text>
<path d="M230 250H150V166" marker-end="url(#a1)"/><text x="160" y="243" class="m s">model calls</text>
<path d="M410 250H530V166" marker-end="url(#a1)"/><text x="420" y="243" class="m s">play, search, taste…</text>
<path d="M70 166V324" marker-end="url(#a1)"/>
<path d="M580 166V324" marker-end="url(#a1)"/>
<rect x="20" y="324" width="180" height="48" rx="3" class="d"/><text x="110" y="345" text-anchor="middle">Spotify AI gateway</text><text x="110" y="362" text-anchor="middle" class="m">Claude Sonnet 4.6</text>
<rect x="440" y="324" width="180" height="48" rx="3" class="d"/><text x="530" y="345" text-anchor="middle">Spotify client</text><text x="530" y="362" text-anchor="middle" class="m">and Spotify's servers</text>
</svg>
<figcaption>Processes on the machine. Dashed boxes are off the machine.</figcaption>
</figure>

## The harness is pi

Sitting next to a 6.7 MB `pi.cjs` bundle in `Contents/Resources/studio/` is a standard `package.json`:

```json
"name": "@mariozechner/pi-coding-agent",
"version": "0.62.0",
"license": "MIT",
"repository": { "url": "git+https://github.com/badlogic/pi-mono.git" }
```

If you haven't come across pi, it's a deliberately small coding agent. Out of the box, it only has four tools (read, write, edit, and bash), leaving everything else to extensions. Projects like OpenClaw and JetBrains' Thinkrail build on top of it, though I hadn't seen anyone mention that Spotify was using it too.

For each conversation, the orchestrator spawns a `pi --mode rpc` subprocess and talks to it over stdin/stdout in JSON. A file path left in the bundle (`pi-mono/packages/coding-agent/dist/cli.js`) suggests Spotify vendors the pi-mono repo directly inside their monorepo. (pi has since moved to the `@earendil-works` scope on npm, while Studio is still pinned to 0.62.0 under the old namespace.)

## Models and credential isolation

Looking at the orchestrator's session state, the default model is `claude-sonnet-4-6`, a very cost-efficient choice, routed through an internal provider named `aigateway-anthropic`. Digging into the code shows a couple of other models in the mix: the agent constructor falls back to `claude-opus-4-6` if no model is specified, and a bundled evaluation harness uses `claude-haiku-4-5` to grade outputs.

Studio's persona prompt instructs the agent to only describe itself as AI built into Studio and never reveal the underlying model or provider—a standard product requirement, though always funny to read in a plain-text Markdown file on disk.

Actual secrets, however, are kept well away from the agent. The pi process never sees an API key. When it makes a model call, it hits `sc-gateway` on localhost (`/api/ai/v1/messages`), which attaches credentials and forwards the request to Spotify's servers. The app keeps its tokens in the macOS Keychain, so nothing the agent can read with its file tools contains a credential.

## Extending pi into a Spotify app

Instead of forking pi, Spotify wrote four extensions loaded from `.pi/extensions/`:

| Extension | What it adds |
|---|---|
| `spotify` | 32 tools covering memory, skills, routines, Gmail, Calendar, MCP, permissions, image generation, UI cards, and chat |
| `background-processes` | Replaces the default `bash` tool with one that manages background jobs |
| `show-form` | Lets the agent render interactive forms in the UI |
| `voice-select` | Picks voices for generated podcasts |

Almost all of the app's behavior lives in that first `spotify` extension. Tools like `memory_search`, `find_and_install_skill`, `create_scheduled_routine`, `google_gmail_search`, `call_mcp_tool`, and `entity_card` are how a generic coding agent gets turned into a consumer music app.

## Skills, memory, and routines

Because pi works well with local files, most of Studio's state is just Markdown and SQLite on disk.

Skills work like on-demand prompt injection. Studio ships with 38 skill folders (podcast-creation, recommend, playlist-editing, gmail, garden-companion, etc.), each containing a Markdown instruction file, plus a `manifest.json` with trigger phrases. When the agent needs to do something specific, it calls `find_and_install_skill()` to pull that Markdown file into its context window. Interestingly, there's also a compatibility layer for ClawHub, OpenClaw's skill registry.

Memory is also stored in Markdown: a long-term `memory.md`, daily logs under `daily/` (today's and yesterday's logs are automatically injected into context), and per-session notes. To make this searchable offline, Studio bundles a 23 MB quantized ONNX build of `all-MiniLM-L6-v2` and indexes the files in local SQLite.

Routines let the agent run on a schedule. A routine is just a Markdown prompt with YAML frontmatter:

```yaml
trigger:
  type: cron
  schedule: 0 8 * * 1-5
  timezone: Europe/Berlin
timeout: 3900
notify: true
```

When a cron job fires—or when a "sensor" like `idle` or `location` triggers—the orchestrator spins up an unattended pi session and drops the output into the main chat as a UI card.

## How it builds a podcast

pi logs every session as JSONL, and Studio keeps those logs under `~/Library/Caches/com.spotify.studio/.studio/pi-agent/`. So after asking Studio to set up a daily morning podcast for me, I went back and read what the agent had actually done. It took about 60 tool calls:

1. Load the `podcast-creation` skill, look up the shows I follow and what I've listened to recently, then show a form so I can pick segments and a delivery time.
2. Save my answers to memory, create a weekday 8:00 routine, and run it once right away.
3. Create a show in my Spotify library with chapter skipping turned on.
4. Pull weather and headlines with `spotify_cli websearch`, and the latest episodes of my shows with `spotify_cli ask`.
5. Write a script and voice it in 17 separate chunks with `spotify_cli tts synthesize`, then join them with `tts stitch`, with 300 ms of silence in between.
6. Generate a cover image and resize it to 900×900.
7. Write a chapters file—segment titles, links to the news sources, and Spotify episode cards timed to pop up while the matching segment plays.
8. Upload the episode, wait for Spotify to finish processing it, then attach the chapters.

The upload step is the only part of this pipeline that's open source (more on that below). Text-to-speech, web search and `ask` are all closed commands inside `spotify_cli`.

## External tools and sub-agents

Studio also acts as an MCP client (`search_mcp_tools`, `call_mcp_tool`), so you can wire up third-party servers. For music-specific queries, though, the local Claude agent doesn't sift through raw Spotify API responses itself. Instead, it shells out to `spotify_cli ask "…"`, handing the question off in plain English to a separate, server-side Spotify service that handles taste profiles and recommendations. When it recommended music to me, that's where the tracks came from.

## Sandboxing and remote kill-switches

Giving an LLM a bash tool and access to your Gmail is obviously risky. Locally, Studio wraps pi in macOS sandbox profiles (`strict-macos.sb` and `legacy-macos.sb`) and filters shell commands through a four-tier policy in `profiles/command-policy.yaml`:

- **allow**: `cat`, `grep`, `jq`, `ls`, etc. run immediately.
- **not listed**: paused until the user clicks approve.
- **high risk**: commands like `osascript` that can escape the sandbox require a two-step confirmation.
- **deny**: blocked outright.

(There's also `spotify_cli pairing`, which displays a QR code for pairing with your phone—it looks like you can approve tool calls from the Spotify mobile app.)

What caught my eye is that Spotify doesn't rely solely on local config files for safety. Studio keeps cached copies of three documents fetched from a Spotify CDN:

- A remote shell policy (denied commands, blocked patterns, and interpreters) that gets merged with the local YAML.
- A skill blocklist.
- A prompt file titled "Soul (immutable)" containing the core safety rules.

On my machine, the policy and the blocklist were still empty. But the plumbing means Spotify can ban a shell command, kill a buggy skill, or tighten the system prompt across all clients without cutting a new release.

<figure class="fig">
<svg viewBox="0 0 640 236" role="img" aria-label="Who wrote which layer of Studio">
<rect x="20" y="8" width="600" height="48" rx="3" class="d"/><text x="36" y="29">Remote policy</text><text x="36" y="46" class="m">shell policy · skill blocklist · safety rules, fetched from Spotify's CDN</text><text x="604" y="37" text-anchor="end" class="m">Spotify</text>
<rect x="20" y="64" width="600" height="48" rx="3"/><text x="36" y="85">Orchestrator and gateway</text><text x="36" y="102" class="m">sessions · routines · skills · memory index · permissions · model proxy</text><text x="604" y="93" text-anchor="end" class="m">Spotify</text>
<rect x="20" y="120" width="600" height="48" rx="3"/><text x="36" y="141">Spotify extension</text><text x="36" y="158" class="m">32 tools: memory, routines, Gmail, Calendar, MCP, UI cards</text><text x="604" y="149" text-anchor="end" class="m">Spotify</text>
<rect x="20" y="176" width="600" height="48" rx="3" class="f"/><text x="36" y="197">pi agent loop</text><text x="36" y="214" class="m">read · write · edit · bash · sessions · RPC mode</text><text x="604" y="205" text-anchor="end" class="m">open source, MIT</text>
</svg>
<figcaption>Who wrote which layer.</figcaption>
</figure>

## Leftovers in the bundle

Poking around a fast-moving research preview always turns up a few fun artifacts:

- The main `AGENTS.md` instruction file is tailored for a music assistant, but still has a section on how to do pull-request reviews—presumably left over from its coding-agent roots.
- The production bundle ships with the team's internal evaluation framework (complete with concurrency settings, an LLM-as-a-judge review model, and references to an internal backend called "radiant"), plus a mock proxy for local dev.
- `build-info.json` proudly reports `"sourceState": "dirty"`.

## A note on spotify_cli and save-to-spotify

Back in April, Spotify open-sourced a Go CLI called [save-to-spotify](https://github.com/spotify/save-to-spotify) (Apache 2.0), designed to let coding agents like Claude Code or OpenClaw upload generated audio into a user's Spotify library.

Studio's closed-source `spotify_cli` binary embeds that exact tool—running `spotify_cli sts …` invokes save-to-spotify v0.1.5 alongside the closed commands for playback, taste queries, and chat. It looks like save-to-spotify was an early experiment that eventually grew into Studio.

## Takeaways

Looking at how Studio is put together, what stands out is how little time Spotify spent reinventing the agent harness. They took an off-the-shelf, MIT-licensed coding loop (pi), left its core alone, and put all of their effort into the edges: the 32 custom tools, the local `spotify_cli` bridge, the macOS sandbox, and the remote policy controls.

Even the prompts and skills sit in plain Markdown on disk. The value isn't in hiding the prompt or building a custom ReAct loop—it's in the plumbing that connects the loop to data only Spotify has.

## Doing the same with my own agent

What I actually wanted from Studio was simpler than Studio itself. I already have a personal assistant—an agent running on my own server—and I wanted *it* to reach into Spotify: see what I've been listening to, put together playlists, and make me a podcast in the morning. Studio does all of this, but only inside its own app, and it couldn't give me segments in more than one language (I'm learning German, so I want the episode to end with a short German practice segment).

Most of the pieces are public. Reading goes through the regular Spotify Web API: you register your own app on Spotify's developer dashboard, log in once, and get your top tracks and artists, recently played, playlists, liked songs and followed podcasts, plus search and playlist creation. (Since February, apps in development mode need Premium and are limited to five users, which is fine for one person.) Writing an episode goes through save-to-spotify, which can create a show, upload episodes, and attach chapters and links. It ships inside the regular Spotify desktop app, so if you have Spotify on a Mac, you already have it.

So I put them together as [rundown](https://github.com/T-64/rundown). Your agent gets tools to read your Spotify account, search, and make playlists, and two more for the morning podcast: one gathers the weather, a few RSS feeds and what earlier episodes already covered, and one voices the script the agent writes and uploads it with chapters. Each segment can be in its own language and voice, with macOS `say`, [Piper](https://github.com/OHF-Voice/piper1-gpl), or any OpenAI-compatible TTS server (Kokoro, Chatterbox, Qwen3-TTS). It's one package—a pi extension and an MCP server—so the same code runs in pi, in DeepSeek's DSH, or in Claude Code.

If you use pi, you can try it with one command:

```
pi install git:github.com/T-64/rundown
```

then type `/rundown` for the podcast. Reading your account is optional and needs your own Spotify developer app first; once that's set up, you can ask something like "make me a playlist from what I've had on repeat this month". Anything that changes your account asks first. The [README](https://github.com/T-64/rundown#install) covers the Spotify setup and the config for DSH and other MCP clients.

If you'd like rundown to do something else, [open an issue](https://github.com/T-64/rundown/issues).

---

*Corrections are welcome via [email](mailto:zhaoqing.tan@outlook.com). If you work on Studio and I got a detail wrong, let me know and I'll update the post.*

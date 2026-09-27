# AI Coding Setup — Free-First Stack

For a Lenovo IdeaPad 3 (16 GB RAM, integrated graphics) doing development on GitHub.
Everything runs in VS Code; the models run elsewhere, so laptop specs aren't the constraint.

**Total cost: $10, one time.**

---

## Daily Use — What to Reach For, In Order

| Order | Tool + model | Cost | Use it for | Limit | How to access |
|---|---|---|---|---|---|
| 1 | GitHub Copilot — completions | Free | Autocomplete while you type. Always on. | 2,000/month | Inline in VS Code. Tab to accept. Nothing to open. |
| 2 | Cline → OpenRouter `:free` models | Free (after the $10) | Your main agent. Multi-step tasks, refactors, debugging. | 1,000/day, 20/min | Cline sidebar in VS Code. Model list: <https://openrouter.ai/models?q=free> |
| 3 | GitHub Copilot — chat | Free | Repo, PR and issue questions where GitHub context matters. | 50/month | Copilot Chat panel in VS Code (`Ctrl+Alt+I`), or <https://github.com/copilot> |
| 4 | Cline → paid Flash models | ~$0.15 in / $0.50 out per M tokens | When a free model loops, mangles edits, or misses the point. | Drains the $10 | Same Cline sidebar — change the model ID in settings |
| 5 | Cline → paid flagship | ~$1.40 in / $4.40 out per M tokens | Last resort. Rare. | Drains it ~10× faster | Same. Switch back down when you're done. |

---

## One-Time Setup

| Step | Where | Link | Cost |
|---|---|---|---|
| Install VS Code | Windows x64 installer | <https://code.visualstudio.com> | Free |
| Install Cline extension | VS Code → Extensions (`Ctrl+Shift+X`) → search "Cline" | <https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev> | Free |
| Enable Copilot Free | Sign in with your GitHub account | <https://github.com/features/copilot> | Free |
| Buy credits | Account → Credits → add $10 | <https://openrouter.ai> | $10 once, never expires |
| Create API key | Account → Keys → Create | <https://openrouter.ai/keys> | — |
| Add key to Cline | Cline sidebar → gear → API Provider → OpenRouter | — | — |

---

## Bookmarks

| Page | What it tells you |
|---|---|
| <https://openrouter.ai/activity> | Per-request spend. This is how you learn whether $10 is a month or a week. |
| GitHub → Settings → Billing | How many of your 50 Copilot chats are left this month. |

---

## Notes

- **The $10 buys two things.** It permanently raises the OpenRouter free-model cap from 50 to 1,000 requests/day, *and* leaves a balance for paid models. The quota unlock is arguably the more valuable half.
- **Free models don't touch the balance.** Anything tagged `:free` stays free. Credits only drain when you deliberately pick a paid model.
- **The 20 req/min cap never moves,** even after buying credits. Cline rarely bumps into it.
- **OpenRouter takes ~5.5%** on pay-as-you-go, so $10 is closer to $9.45 of actual usage.
- **Reach for Flash tier first** when you're stuck. Roughly 10× cheaper than flagships and usually enough.
- **Start Cline in Plan mode.** Read the plan, then switch to Act. Leave auto-approve off until you trust it.
- **Commit before you let the agent work.** Git is the real undo button, independent of Cline's checkpoints.

---

## When to Consider Paying More

Check in after a month. If you're constantly at row 4 or 5 of the daily-use table:

| Option | Cost | Best if |
|---|---|---|
| GitHub Copilot Pro | $10/mo | The 50-chat ceiling is what annoys you. Unlimited completions, cloud coding agent, access to third-party agents (Claude Code, Codex). |
| GLM Coding Plan Lite | $18/mo ($12.60 annual) | Agentic quality is what you want. ~80 prompts/5 hrs, ~400/week. Works natively in Cline. |
| Neither | $0 | Most likely outcome if this is hobby-scale. |

---

## Caveats

- Free tiers in this space change constantly. Verify current limits on each vendor's own page rather than trusting these numbers months from now.
- GitHub moved Copilot to usage-based billing on 1 June 2026, so older guides describe a system that no longer exists.
- GLM is from Z.ai, a Chinese vendor. Fine for personal projects; think harder about client work.
- Most sites publishing these comparisons run affiliate links. Check prices at the source.

*Compiled September 2026.*

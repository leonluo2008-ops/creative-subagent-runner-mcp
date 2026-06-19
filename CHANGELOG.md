# Changelog

All notable changes to `creative-subagent-runner-mcp` are documented here.

## [0.1.0] - 2026-06-19

### Added
- Initial release
- 3 MCP tools:
  - `health_check` - server + provider status (redacted)
  - `list_subagent_roles` - role registry + default routes
  - `run_subagent` - validate → resolve → LLM call → return
- 4 sub-agent roles:
  - `chapter_writer` (openai / `gpt-5.4-mini`)
  - `structure_auditor` (gemini / `gemini-3.1-pro-preview`)
  - `style_auditor` (gemini / `gemini-3.1-pro-preview`)
  - `reviser` (openai / `gpt-5.4-mini`)
- Provider router with `provider_role_mismatch` validation
- Production lock: `ALLOW_PROVIDER_OVERRIDE=false`
- Bearer Token auth (constant-time compare)
- API key redaction in logs/errors
- Input size limit (`MAX_INPUT_CHARS=120000`)
- Timeout control (`DEFAULT_TIMEOUT_MS=120000`)
- systemd unit + `deploy.sh` (install/restart/stop/status/logs/verify/uninstall)
- End-to-end tested:
  - chapter_writer: 12.3s, 375 中文字 (Rabbit Moonlight S1E01)
  - structure_auditor: 19s, score 9.5/10
  - style_auditor: 17.5s, score 9.5/10

### Security
- No shell execution
- No Notion token / Notion writes
- No file system reads/writes
- API keys in .env only (chmod 600)
- Redact module strips `sk-...` / Bearer tokens from logs

### Known Limitations
- Production deployment requires side-router port mapping (https://mcp.your-domain.com)
- Notion AI (consumer) does not support custom MCP servers yet — main dispatcher must call MCP, then write to Notion
- Gemini 3.1 thinking model requires `maxOutputTokens >= 2000`
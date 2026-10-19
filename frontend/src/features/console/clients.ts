// How to plug this project into each assistant. Every snippet is built from the real share origin.
// Formats checked against each tool's docs on 2026-10-19; see docs/contracts/connect-clients.md.

export type Lang = 'th' | 'en';
type Text = Record<Lang, string>;
export type Snippet = { label: Text; where?: string; code: string };
export type Client = {
  id: string; name: string; vendor: string; protocols: ('MCP' | 'A2A' | 'REST')[];
  hint: Text; needsPublicHttps?: boolean; snippets: Snippet[];
};

const T = '<ACCESS_TOKEN>';
const NAME = 'job-search';

export function clients(share: string, api: string, projectId: string): Client[] {
  const mcp = `${share}/mcp`;
  const json = (value: unknown) => JSON.stringify(value, null, 2);
  return [
    {
      id: 'hermes', name: 'Hermes Agent', vendor: 'Nous Research', protocols: ['MCP', 'A2A'],
      hint: {
        th: 'เพิ่มทั้ง MCP (เครื่องมือของเรา) และ A2A (ส่งงานให้เอเจนต์ของเรา) ใน config ของ Hermes แล้วเปิด toolset a2a',
        en: 'Add both MCP (our tools) and A2A (hand work to our agent) to the Hermes config, then enable the a2a toolset.',
      },
      snippets: [
        { label: { th: 'เพิ่มใน config ของ Hermes', en: 'Add to the Hermes config' }, where: '~/.hermes/config.yaml', code:
`mcp_servers:
  job_search:
    url: "${mcp}"
    headers:
      Authorization: "Bearer ${T}"

a2a_agents:
  job_search:
    url: "${share}"
    auth: { type: bearer, token: "${T}" }
    timeout: 600` },
        { label: { th: 'เปิดเครื่องมือ A2A', en: 'Enable the A2A tools' }, code: 'hermes tools enable a2a --platform cli' },
      ],
    },
    {
      id: 'claude-code', name: 'Claude Code', vendor: 'Anthropic', protocols: ['MCP'],
      hint: { th: 'รันคำสั่งนี้ครั้งเดียวในเทอร์มินัล', en: 'Run this once in a terminal.' },
      snippets: [{ label: { th: 'คำสั่ง', en: 'Command' }, code: `claude mcp add --transport http ${NAME} ${mcp} --header "Authorization: Bearer ${T}"` }],
    },
    {
      id: 'claude-desktop', name: 'Claude Desktop', vendor: 'Anthropic', protocols: ['MCP'],
      hint: {
        th: 'เปิด Settings > Developer > Edit Config วางข้อความนี้ แล้วปิดเปิดแอปใหม่ (ต้องมี Node.js)',
        en: 'Open Settings > Developer > Edit Config, paste this and restart the app (needs Node.js).',
      },
      snippets: [{ label: { th: 'ไฟล์ตั้งค่า', en: 'Config file' }, where: 'claude_desktop_config.json', code: json({
        mcpServers: { [NAME]: { command: 'npx', args: ['-y', 'mcp-remote', mcp, '--header', 'Authorization:${AUTH_HEADER}'], env: { AUTH_HEADER: `Bearer ${T}` } } },
      }) }],
    },
    {
      id: 'claude-ai', name: 'Claude.ai', vendor: 'Anthropic', protocols: ['MCP'], needsPublicHttps: true,
      hint: {
        th: 'Settings > Connectors > Add custom connector ใส่ที่อยู่ MCP แล้วลงชื่อเข้าใช้และกดอนุญาต ไม่ต้องใช้ token',
        en: 'Settings > Connectors > Add custom connector, enter the MCP address, then sign in and allow. No token needed.',
      },
      snippets: [{ label: { th: 'ที่อยู่ MCP', en: 'MCP address' }, code: mcp }],
    },
    {
      id: 'chatgpt', name: 'ChatGPT', vendor: 'OpenAI', protocols: ['MCP'], needsPublicHttps: true,
      hint: {
        th: 'Settings > Apps & Connectors > Advanced เปิด Developer mode แล้วกด Create ใส่ที่อยู่ MCP เลือกการยืนยันตัวตนแบบ OAuth',
        en: 'Settings > Apps & Connectors > Advanced, turn on Developer mode, then Create. Enter the MCP address and choose OAuth.',
      },
      snippets: [{ label: { th: 'ที่อยู่ MCP', en: 'MCP address' }, code: mcp }],
    },
    {
      id: 'codex', name: 'Codex CLI', vendor: 'OpenAI', protocols: ['MCP'],
      hint: {
        th: 'Codex อ่าน token จากตัวแปรสภาพแวดล้อม จึงไม่ต้องเก็บ token ในไฟล์ ครั้งแรกที่เรียกเครื่องมือ Codex จะถามให้คุณอนุญาต',
        en: 'Codex reads the token from an environment variable, so it never sits in a file. It asks you to allow the first tool call.',
      },
      snippets: [
        { label: { th: 'คำสั่ง', en: 'Command' }, code: `codex mcp add ${NAME} --url ${mcp} --bearer-token-env-var JOB_SEARCH_TOKEN` },
        { label: { th: 'ใส่ token ก่อนเปิด Codex', en: 'Set the token before starting Codex' }, code: `export JOB_SEARCH_TOKEN="${T}"` },
      ],
    },
    {
      id: 'gemini', name: 'Gemini CLI', vendor: 'Google', protocols: ['MCP'],
      hint: { th: 'รันคำสั่งนี้ครั้งเดียว หรือเพิ่มในไฟล์ตั้งค่าเอง', en: 'Run this once, or add it to the settings file yourself.' },
      snippets: [
        { label: { th: 'คำสั่ง', en: 'Command' }, code: `gemini mcp add --scope user --transport http ${NAME} ${mcp} -H "Authorization: Bearer ${T}"` },
        { label: { th: 'หรือแก้ไฟล์ตั้งค่า', en: 'Or edit the settings file' }, where: '~/.gemini/settings.json', code: json({
          mcpServers: { [NAME]: { url: mcp, type: 'http', headers: { Authorization: `Bearer ${T}` } } },
        }) },
      ],
    },
    {
      id: 'vscode', name: 'VS Code + GitHub Copilot', vendor: 'Microsoft', protocols: ['MCP'],
      hint: { th: 'VS Code จะถาม token ตอนเริ่มใช้ครั้งแรก จึงไม่ต้องเก็บ token ในไฟล์', en: 'VS Code asks for the token the first time, so it never sits in the file.' },
      snippets: [{ label: { th: 'ไฟล์ตั้งค่า', en: 'Config file' }, where: '.vscode/mcp.json', code: json({
        inputs: [{ type: 'promptString', id: 'job-search-token', description: 'Job Search access token', password: true }],
        servers: { [NAME]: { type: 'http', url: mcp, headers: { Authorization: 'Bearer ${input:job-search-token}' } } },
      }) }],
    },
    {
      id: 'cursor', name: 'Cursor', vendor: 'Anysphere', protocols: ['MCP'],
      hint: { th: 'วางในไฟล์นี้ แล้วเปิด Cursor Settings > MCP เพื่อดูว่าเชื่อมต่อแล้ว', en: 'Paste into this file, then check Cursor Settings > MCP shows it connected.' },
      snippets: [{ label: { th: 'ไฟล์ตั้งค่า', en: 'Config file' }, where: '~/.cursor/mcp.json', code: json({
        mcpServers: { [NAME]: { url: mcp, headers: { Authorization: `Bearer ${T}` } } },
      }) }],
    },
    {
      id: 'a2a-python', name: 'Python a2a-sdk (ADK, LangGraph, CrewAI)', vendor: 'A2A', protocols: ['A2A'],
      hint: {
        th: 'เอเจนต์ที่สร้างด้วยไลบรารี A2A อย่างเป็นทางการ ส่งงานแล้วรับความคืบหน้าแบบสดจนได้ผลลัพธ์',
        en: 'Agents built on the official A2A library send work and follow live progress until the result is ready.',
      },
      snippets: [
        { label: { th: 'Agent card', en: 'Agent card' }, code: `${share}/.well-known/agent-card.json` },
        { label: { th: 'ตัวอย่างโค้ด (pip install a2a-sdk httpx)', en: 'Example (pip install a2a-sdk httpx)' }, code:
`import asyncio, uuid, httpx
from a2a.client import ClientConfig, create_client
from a2a.types import SendMessageRequest
from google.protobuf.json_format import ParseDict

async def main():
    http = httpx.AsyncClient(headers={"Authorization": "Bearer ${T}", "A2A-Version": "1.0"}, timeout=600)
    client = await create_client("${share}", ClientConfig(streaming=True, httpx_client=http))
    job = {"title": "Data Analyst", "company": "Example Co", "description": "SQL, Python, Power BI"}
    request = ParseDict({"message": {"messageId": str(uuid.uuid4()), "role": "ROLE_USER",
        "parts": [{"data": {"job": job, "output_language": "th", "idempotency_key": str(uuid.uuid4())}}],
        "metadata": {"skill_id": "evaluate_job"}}}, SendMessageRequest())
    async for event in client.send_message(request):
        print(event)

asyncio.run(main())` },
      ],
    },
    {
      id: 'rest', name: 'REST API', vendor: '', protocols: ['REST'],
      hint: { th: 'สำหรับนักพัฒนาที่เขียนโปรแกรมเอง ใส่ token ในหัวข้อ Authorization ทุกคำขอ', en: 'For developers writing their own code. Send the token in the Authorization header of every request.' },
      snippets: [
        { label: { th: 'REST API base URL', en: 'REST API base URL' }, code: api },
        { label: { th: 'ตัวอย่าง: ดูรายการงานที่สั่ง', en: 'Example: list the work you started' }, code: `curl -H "Authorization: Bearer ${T}" ${api}/projects/${projectId}/runs` },
      ],
    },
  ];
}

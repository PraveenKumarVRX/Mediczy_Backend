import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['index.js'],
});

const client = new Client({ name: 'test-client', version: '0.1.0' });
await client.connect(transport);

const tools = await client.listTools();
console.log('=== TOOLS ===');
console.log(tools.tools.map((t) => t.name).join('\n'));

for (const name of ['get_pm2_status', 'get_service_health', 'check_object_storage', 'get_db_connection_stats', 'get_ris_study_stats', 'get_corporate_health_report_stats']) {
  console.log(`\n=== CALL: ${name} ===`);
  try {
    const result = await client.callTool({ name, arguments: {} });
    console.log(result.content[0].text.slice(0, 800));
  } catch (err) {
    console.log('ERROR:', err.message);
  }
}

console.log('\n=== CALL: get_pm2_logs (mediczy-server, 5 lines) ===');
const logResult = await client.callTool({ name: 'get_pm2_logs', arguments: { name: 'mediczy-server', lines: 5 } });
console.log(logResult.content[0].text.slice(0, 500));

console.log('\n=== CALL: get_pm2_logs (invalid name, should error cleanly) ===');
const badResult = await client.callTool({ name: 'get_pm2_logs', arguments: { name: 'rm -rf /; #' } });
console.log('isError:', badResult.isError, '-', badResult.content[0].text);

await client.close();
process.exit(0);

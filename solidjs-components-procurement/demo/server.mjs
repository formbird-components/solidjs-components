// Runs fieldtec-web on the procurement demo (server/config/solid-procurement.json): http://localhost:3005
// The output is also written to demo/server.log, where `pnpm demo:e2e` reads the rules' messages.
import { startServer } from '@solidjs-components/platform/fieldtec';

startServer({ name: 'solid-procurement', log: new URL('./server.log', import.meta.url) });

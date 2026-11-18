// Runs fieldtec-web on the HR demo (server/config/solid-hr.json): http://localhost:3004
// The output is also written to demo/server.log, where `pnpm demo:e2e` reads the rules' messages.
import { startServer } from '@solidjs-components/platform/fieldtec';

startServer({ name: 'solid-hr', log: new URL('./server.log', import.meta.url) });

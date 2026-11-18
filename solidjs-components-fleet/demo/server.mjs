// Runs fieldtec-web on the fleet demo (server/config/solid-fleet.json): http://localhost:3001
// The output is also written to demo/server.log, where `pnpm demo:e2e` reads the rules' messages.
import { startServer } from '@solidjs-components/platform/fieldtec';

startServer({ name: 'solid-fleet', log: new URL('./server.log', import.meta.url) });

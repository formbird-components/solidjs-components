// Runs fieldtec-web on the safety demo (server/config/solid-whs.json): http://localhost:3002
// The output is also written to demo/server.log, where `pnpm demo:e2e` reads the rules' messages.
import { startServer } from '@solidjs-components/platform/fieldtec';

startServer({ name: 'solid-whs', log: new URL('./server.log', import.meta.url) });

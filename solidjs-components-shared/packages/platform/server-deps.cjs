// Preload for fieldtec-web's built server (server/*.js): resolves its packages from the versions
// projects/server/package.json declares, instead of whatever is in the repo-root node_modules.
//
// Why: in a checkout where the root node_modules holds older copies that pnpm doesn't manage
// (seen: mongodb 4.11.0 and express 4.17.1 as plain directories), the built server picks them up.
// With mongodb 4, creating a document that has a "Reference No" field crashes the server
// (findOneAndUpdate returns { value } instead of the document); with express 4, links such as
// /form/<id> return 404 instead of the app.
//
// Run from the fieldtec-web root:
//   WEB_APP_SERVER=solid-demo node --require <this file> server/ServerApp.js

const Module = require('module');
const path = require('path');

const root = process.cwd();
const serverOutput = path.join(root, 'server') + path.sep;
const fromServerProject = Module.createRequire(path.join(root, 'projects/server/package.json'));
const resolve = Module._resolveFilename;

Module._resolveFilename = function (request, parent, isMain, options) {
  const bare = !request.startsWith('.') && !path.isAbsolute(request) && !request.startsWith('node:');
  const fromBuiltServer = parent?.filename?.startsWith(serverOutput) && !parent.filename.includes(`${path.sep}node_modules${path.sep}`);
  if (bare && fromBuiltServer) {
    try {
      return fromServerProject.resolve(request);
    } catch {
      // Not a projects/server dependency: normal resolution.
    }
  }
  return resolve.call(this, request, parent, isMain, options);
};

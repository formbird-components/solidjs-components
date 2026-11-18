// Ambient types every repo's sources rely on (`?inline` CSS imports, import.meta.env), resolved
// from solidjs-components-shared's node_modules. tsconfig.base.json lists this file, so app repos
// that extend it get the same types without installing Vite.
/// <reference types="vite/client" />

import { serveHandler } from '../_shared/serve.ts';
import { handleImportOperations } from '../../../src/lib/server/import-operations.ts';

serveHandler(handleImportOperations);

import { serveHandler } from '../_shared/serve.ts';
import { handleCreateOperation } from '../../../src/lib/server/create-operation.ts';

serveHandler(handleCreateOperation);

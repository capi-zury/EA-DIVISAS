import { serveHandler } from '../_shared/serve.ts';
import { handleAdminUsers } from '../../../src/lib/server/admin-users.ts';

serveHandler(handleAdminUsers);

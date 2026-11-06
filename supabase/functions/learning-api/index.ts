import { createHandler } from './backend.mjs';
// JWT verification is done against Auth on every user request. The worker has a
// separate server-only token. No caller-supplied user ID or service key is trusted.
Deno.serve(createHandler(Deno.env.toObject()));

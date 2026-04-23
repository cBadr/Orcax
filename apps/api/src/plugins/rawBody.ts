import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

// Capture raw body for routes that opt-in via `config.rawBody: true`.
// Required for IPN signature verification.
const plugin: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req, body: string, done) => {
      (req as unknown as { rawBody?: string }).rawBody = body;
      try {
        done(null, body.length === 0 ? {} : JSON.parse(body));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );
};

export default fp(plugin, { name: 'rawBody' });

import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

const plugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid input',
        issues: error.errors,
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
        details: error.details,
      });
    }

    if ((error as { validation?: unknown }).validation) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: error.message,
      });
    }

    req.log.error({ err: error }, 'Unhandled error');
    return reply.status(500).send({
      error: 'SERVER_ERROR',
      message: 'Internal server error',
    });
  });
};

export default fp(plugin, { name: 'errorHandler' });

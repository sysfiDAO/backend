import { ValidationError } from '../utils/errors.js';

/**
 * Zod validation middleware factory.
 *
 * Usage:
 *   router.post('/path', validate(MyZodSchema), handler);
 *
 * The schema should be a z.object({ body?, query?, params? }) shape.
 * Validated & coerced values are merged back into req so handlers use them directly.
 */
export function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse({
      body:   req.body,
      query:  req.query,
      params: req.params,
    });

    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field:   e.path.join('.'),
        message: e.message,
      }));
      return next(new ValidationError('Validation failed', errors));
    }

    if (result.data.body   !== undefined) req.body   = result.data.body;
    if (result.data.query  !== undefined) req.query  = result.data.query;
    if (result.data.params !== undefined) req.params = result.data.params;

    next();
  };
}

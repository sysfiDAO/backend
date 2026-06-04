import { randomUUID } from 'crypto';

// Attach a unique request ID to every request for tracing across logs.
// Respects any X-Request-ID header forwarded by a gateway/load-balancer.
export const requestId = (req, res, next) => {
  req.id = req.headers['x-request-id'] || randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
};

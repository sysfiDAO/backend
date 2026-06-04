import pino from 'pino';

const IS_DEV = process.env.NODE_ENV !== 'production';

const pinoInstance = pino({
  level: IS_DEV ? 'debug' : 'info',
  ...(IS_DEV && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname',
        messageFormat: '{msg}',
      },
    },
  }),
  ...(!IS_DEV && {
    formatters: { level: (label) => ({ level: label }) },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  }),
});

// Maintain the existing public interface so all callers continue to work unchanged.
// In dev, pino-pretty renders coloured output. In prod, structured JSON goes to stdout.
class Logger {
  info(message, data = null) {
    data ? pinoInstance.info(data, message) : pinoInstance.info(message);
  }

  success(message, data = null) {
    if (data) {
      pinoInstance.info({ ...data, success: true }, message);
    } else {
      pinoInstance.info({ success: true }, message);
    }
  }

  warn(message, data = null) {
    data ? pinoInstance.warn(data, message) : pinoInstance.warn(message);
  }

  error(message, error = null) {
    error ? pinoInstance.error({ err: error }, message) : pinoInstance.error(message);
  }

  debug(message, data = null) {
    data ? pinoInstance.debug(data, message) : pinoInstance.debug(message);
  }

  chain(chainName, message) {
    pinoInstance.info({ chain: chainName }, message);
  }

  // Expose the raw pino instance for pino-http
  get raw() {
    return pinoInstance;
  }
}

export default new Logger();

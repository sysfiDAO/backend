class Logger {
  constructor() {
    this.colors = {
      reset: '\x1b[0m',
      bright: '\x1b[1m',
      dim: '\x1b[2m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
    };
  }

  getTimestamp() {
    return new Date().toISOString();
  }

  info(message, data = null) {
    console.log(
      `${this.colors.blue}[INFO]${this.colors.reset} ${this.colors.dim}${this.getTimestamp()}${this.colors.reset} - ${message}`
    );
    if (data) console.log(data);
  }

  success(message, data = null) {
    console.log(
      `${this.colors.green}[SUCCESS]${this.colors.reset} ${this.colors.dim}${this.getTimestamp()}${this.colors.reset} - ${message}`
    );
    if (data) console.log(data);
  }

  warn(message, data = null) {
    console.warn(
      `${this.colors.yellow}[WARN]${this.colors.reset} ${this.colors.dim}${this.getTimestamp()}${this.colors.reset} - ${message}`
    );
    if (data) console.warn(data);
  }

  error(message, error = null) {
    console.error(
      `${this.colors.red}[ERROR]${this.colors.reset} ${this.colors.dim}${this.getTimestamp()}${this.colors.reset} - ${message}`
    );
    if (error) {
      console.error(error);
    }
  }

  debug(message, data = null) {
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `${this.colors.magenta}[DEBUG]${this.colors.reset} ${this.colors.dim}${this.getTimestamp()}${this.colors.reset} - ${message}`
      );
      if (data) console.log(data);
    }
  }

  chain(chainName, message) {
    console.log(
      `${this.colors.cyan}[${chainName}]${this.colors.reset} ${this.colors.dim}${this.getTimestamp()}${this.colors.reset} - ${message}`
    );
  }
}

export default new Logger();
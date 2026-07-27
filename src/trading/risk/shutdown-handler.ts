/**
 * Process termination signal handler.
 *
 * Intercepts SIGTERM and SIGINT to perform a safe shutdown:
 * 1. Reject new entries
 * 2. Finish current processing
 * 3. Close positions
 * 4. Persist state
 * 5. Flush logs
 * 6. Release resources
 *
 * @module trading
 */

export type ShutdownHook = () => Promise<void>;

/**
 * Handler for process termination signals.
 * Performs a safe shutdown sequence when SIGTERM or SIGINT is received.
 */
export class ShutdownHandler {
  private hooks: ShutdownHook[] = [];
  private shutdownInProgress = false;
  private registered = false;

  /**
   * Register a shutdown hook to be called during safe shutdown.
   */
  addHook(hook: ShutdownHook): void {
    this.hooks.push(hook);
  }

  /**
   * Register signal handlers. Call once during application startup.
   */
  register(): void {
    if (this.registered) return;
    this.registered = true;

    const handleSignal = async (signal: string) => {
      if (this.shutdownInProgress) {
        console.log(`[Shutdown] ${signal} received again — forcing exit`);
        process.exit(1);
      }

      this.shutdownInProgress = true;
      console.log(`[Shutdown] ${signal} received — starting safe shutdown`);

      try {
        await this.executeShutdown(signal);
        console.log('[Shutdown] Complete');
      } catch (err) {
        console.error('[Shutdown] Error during shutdown:', err);
      }

      process.exit(0);
    };

    process.on('SIGTERM', () => handleSignal('SIGTERM'));
    process.on('SIGINT', () => handleSignal('SIGINT'));
  }

  /**
   * Unregister signal handlers (useful for testing).
   */
  unregister(): void {
    if (!this.registered) return;
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    this.registered = false;
  }

  /**
   * Execute all registered shutdown hooks in order.
   */
  async executeShutdown(reason: string): Promise<void> {
    for (let i = 0; i < this.hooks.length; i++) {
      const hook = this.hooks[i]!;
      try {
        await hook();
      } catch (err) {
        console.error(`[Shutdown] Hook ${i} failed:`, err);
      }
    }
  }

  /** Whether a shutdown is currently in progress. */
  get isShuttingDown(): boolean {
    return this.shutdownInProgress;
  }
}

/**
 * Create a shutdown handler and register signal handlers.
 */
export function createShutdownHandler(): ShutdownHandler {
  const handler = new ShutdownHandler();
  handler.register();
  return handler;
}

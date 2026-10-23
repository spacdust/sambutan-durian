export type QueueTask<T> = () => Promise<T>;

/** Serializes sends per WhatsApp number while allowing different numbers independently. */
export class PerNumberQueue {
    private readonly tails = new Map<string, Promise<void>>();
    private readonly depths = new Map<string, number>();

    enqueue<T>(
        sessionId: string,
        delayMs: number,
        task: QueueTask<T>,
        onDelayStart?: () => Promise<void>,
        onDelayEnd?: () => Promise<void>,
    ): Promise<T> {
        const previous = this.tails.get(sessionId) || Promise.resolve();
        this.depths.set(sessionId, (this.depths.get(sessionId) || 0) + 1);
        const run = previous.then(async () => {
            if (delayMs > 0) {
                if (onDelayStart) {
                    try {
                        await onDelayStart();
                    } catch {}
                }
                await new Promise((resolve) => setTimeout(resolve, delayMs));
                if (onDelayEnd) {
                    try {
                        await onDelayEnd();
                    } catch {}
                }
            }
            return task();
        });
        const tail = run.then(() => undefined, () => undefined).finally(() => {
            const depth = (this.depths.get(sessionId) || 1) - 1;
            if (depth <= 0) {
                this.depths.delete(sessionId);
                this.tails.delete(sessionId);
            } else this.depths.set(sessionId, depth);
        });
        this.tails.set(sessionId, tail);
        return run;
    }

    depth(sessionId: string) { return this.depths.get(sessionId) || 0; }
}

export class QueueProtection {
    constructor({ windowSize = 100, qDelayRef = 15, alpha = 0.125, beta = 0.25, maxBurst = 150, queueConcurrency = 1 }) {
        this.requestQueue = [];
        this.latencyWindow = [];
        this.windowSize = windowSize;
        this.qDelayRef = qDelayRef;
        this.alpha = alpha;
        this.beta = beta;
        this.dropProbability = 0;
        this.qdelayOld = 0;
        this.maxBurst = maxBurst;
        this.burstAllowance = this.maxBurst;
        this.lastRunTime = null;
        this.queueConcurrency = queueConcurrency;
        console.log("qprotect-8033 config: \n" + JSON.stringify({
            windowSize: this.windowSize,
            qDelayRef: this.qDelayRef,
            alpha: this.alpha,
            beta: this.beta,
            maxBurst: this.maxBurst,
            queueConcurrency: this.queueConcurrency
        }, null, 2));
    }

    pushLatency(latency) {
        if (this.latencyWindow.length >= this.windowSize) {
            this.latencyWindow.shift();
        }
        this.latencyWindow.push(latency);
    }

    getAverageLatency() {
        if (this.latencyWindow.length === 0) return 0;
        const totalLatency = this.latencyWindow.reduce((acc, cur) => acc + cur, 0);
        return totalLatency / this.latencyWindow.length;
    }

    calculateDropProbability() {
        const now = Date.now();
        const tUpdate = now - (this.lastRunTime || now);
        this.lastRunTime = now;
        this.burstAllowance = Math.max(0, this.burstAllowance - tUpdate);

        const currentQDelay = this.getAverageLatency();
        let p = this.alpha * (currentQDelay - this.qDelayRef) + this.beta * (currentQDelay - this.qdelayOld);

        if (this.dropProbability < 0.000001) {
            p /= 2048;
        } else if (this.dropProbability < 0.00001) {
            p /= 512;
        } else if (this.dropProbability < 0.0001) {
            p /= 128;
        } else if (this.dropProbability < 0.001) {
            p /= 32;
        } else if (this.dropProbability < 0.01) {
            p /= 8;
        } else if (this.dropProbability < 0.1) {
            p /= 2;
        }

        this.dropProbability += p;
        if (currentQDelay === 0 && this.qdelayOld === 0) {
            this.dropProbability *= 0.98;
        }

        this.dropProbability = Math.min(Math.max(this.dropProbability, 0), 1);
        this.qdelayOld = currentQDelay;

        console.log(`currentQDelay: ${currentQDelay}, dropProbability: ${this.dropProbability}`);
        return this.dropProbability;
    }

    qprotect = (req, res, next) => {
        const queue = () => {
            const requestTime = Date.now();
            this.requestQueue.push([req, next, requestTime]);
            if (this.requestQueue.length === 1) {
                this.processQueue();
            }
        };

        this.dropProbability = this.calculateDropProbability();
        if (this.dropProbability < 0.2) {
            queue();
        } else {
            if (this.burstAllowance <= 0 && Math.random() < this.dropProbability) {
                res.status(500).send("Server is overloaded");
            } else {
                queue();
            }
            if (this.dropProbability <= 0 && this.getAverageLatency() < this.qDelayRef / 2 && this.qdelayOld < this.qDelayRef / 2) {
                this.burstAllowance = this.maxBurst;
            }
        }
    }

    processQueue() {
        const process = () => {
            for (let i = 0; i < this.queueConcurrency && this.requestQueue.length; i++) {
                const [_, next, requestTime] = this.requestQueue.shift();
                const latency = Date.now() - requestTime;
                this.pushLatency(latency);
                next();
            }
            if (this.requestQueue.length) {
                setTimeout(process, 0);
            }
        };
        setTimeout(process, 0);
    }
}

import { icons, logEntry, logSection } from "./config";

// --- Performance Utilities ---
export class PerformanceTracker {
    private marks: Map<string, number> = new Map();
    private metrics: Map<string, number> = new Map();

    start(label: string) {
        this.marks.set(label, Date.now());
    }

    end(label: string) {
        const startTime = this.marks.get(label);
        if (startTime) {
            const duration = Date.now() - startTime;
            this.metrics.set(label, duration);
        }
    }

    logReport() {
        logSection("Performance Metrics");
        // Convert Map to object for logging
        const report: Record<string, string> = {};
        this.metrics.forEach((v, k) => {
             report[k] = `${v}ms`;
             logEntry(k, `${v}ms`, icons.clock);
        });
    }
}
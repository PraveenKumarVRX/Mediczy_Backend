/**
 * Debug Utility for Mediczy Application
 * Provides enhanced debugging capabilities with stack traces, performance monitoring, and more
 */

import util from 'util';
import { logger } from './logger.js';

class Debugger {
    constructor(namespace = 'APP') {
        this.namespace = namespace;
        this.enabled = process.env.DEBUG === '*' ||
            process.env.DEBUG?.includes(namespace) ||
            process.env.NODE_ENV === 'development';
        this.timers = new Map();
        this.counters = new Map();
    }

    /**
     * Log a debug message
     */
    log(...args) {
        if (!this.enabled) return;

        const message = args.map(arg =>
            typeof arg === 'object' ? util.inspect(arg, { depth: 5, colors: true }) : arg
        ).join(' ');

        logger.debug(`[${this.namespace}] ${message}`);
    }

    /**
     * Log an error with stack trace
     */
    error(message, error) {
        if (error instanceof Error) {
            logger.error(`[${this.namespace}] ${message}`, {
                error: error.message,
                stack: error.stack,
                name: error.name
            });
        } else {
            logger.error(`[${this.namespace}] ${message}`, { error });
        }
    }

    /**
     * Start a performance timer
     */
    time(label) {
        if (!this.enabled) return;
        this.timers.set(label, {
            start: process.hrtime.bigint(),
            label
        });
    }

    /**
     * End a performance timer and log the duration
     */
    timeEnd(label) {
        if (!this.enabled) return;

        const timer = this.timers.get(label);
        if (!timer) {
            this.log(`Timer '${label}' does not exist`);
            return;
        }

        const end = process.hrtime.bigint();
        const duration = Number(end - timer.start) / 1_000_000; // Convert to milliseconds

        this.log(`⏱️  ${label}: ${duration.toFixed(2)}ms`);
        this.timers.delete(label);

        return duration;
    }

    /**
     * Log memory usage
     */
    memory(label = 'Memory Usage') {
        if (!this.enabled) return;

        const usage = process.memoryUsage();
        const formatted = {
            rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
            heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
            external: `${Math.round(usage.external / 1024 / 1024)}MB`
        };

        this.log(`📊 ${label}:`, formatted);
        return formatted;
    }

    /**
     * Increment a counter
     */
    count(label) {
        if (!this.enabled) return;

        const current = this.counters.get(label) || 0;
        const newValue = current + 1;
        this.counters.set(label, newValue);

        this.log(`🔢 ${label}: ${newValue}`);
        return newValue;
    }

    /**
     * Reset a counter
     */
    countReset(label) {
        if (!this.enabled) return;
        this.counters.set(label, 0);
        this.log(`🔄 ${label} reset to 0`);
    }

    /**
     * Log a stack trace
     */
    trace(message = 'Trace') {
        if (!this.enabled) return;

        const stack = new Error().stack;
        logger.debug(`[${this.namespace}] ${message}`, { stack });
    }

    /**
     * Assert a condition
     */
    assert(condition, message = 'Assertion failed') {
        if (!this.enabled) return;

        if (!condition) {
            const error = new Error(message);
            this.error(message, error);
            throw error;
        }
    }

    /**
     * Log function entry/exit (decorator pattern)
     */
    traceFunction(fn, fnName) {
        if (!this.enabled) return fn;

        const dbg = this;
        return async function (...args) {
            const callId = Math.random().toString(36).substring(7);
            dbg.log(`→ Entering ${fnName || fn.name} [${callId}]`, { args });
            dbg.time(`${fnName || fn.name}-${callId}`);

            try {
                const result = await fn.apply(this, args);
                dbg.timeEnd(`${fnName || fn.name}-${callId}`);
                dbg.log(`← Exiting ${fnName || fn.name} [${callId}]`, { result });
                return result;
            } catch (error) {
                dbg.timeEnd(`${fnName || fn.name}-${callId}`);
                dbg.error(`✖ Error in ${fnName || fn.name} [${callId}]`, error);
                throw error;
            }
        };
    }

    /**
     * Log object properties in a formatted way
     */
    inspect(obj, label = 'Object') {
        if (!this.enabled) return;

        this.log(`🔍 ${label}:`, util.inspect(obj, {
            depth: 10,
            colors: true,
            showHidden: false,
            maxArrayLength: 100
        }));
    }

    /**
     * Create a child debugger with a sub-namespace
     */
    child(subNamespace) {
        return new Debugger(`${this.namespace}:${subNamespace}`);
    }
}

// Export factory function
export function createDebugger(namespace) {
    return new Debugger(namespace);
}

// Export default debuggers for common use cases
export const debug = new Debugger('APP');
export const dbDebug = new Debugger('DATABASE');
export const apiDebug = new Debugger('API');
export const authDebug = new Debugger('AUTH');
export const aiDebug = new Debugger('AI');

export default Debugger;

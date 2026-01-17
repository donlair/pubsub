export const MIN_BUN_VERSION = '1.1.31';

/**
 * Check Bun version and warn if below minimum required version.
 * Bun version significantly affects benchmark performance due to GC and runtime differences.
 * All benchmark results should document the exact Bun version used.
 */
export function checkBunVersion(): void {
	if (Bun.version < MIN_BUN_VERSION) {
		console.warn(
			`⚠️  Warning: Bun ${Bun.version} < ${MIN_BUN_VERSION}. Results may vary due to GC/runtime differences.`,
		);
	}
}

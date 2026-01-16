/**
 * Resource name formatting utilities.
 * Ensures consistent resource naming across the library.
 */

/**
 * Extracts project ID from a resource name.
 * @param resourceName Full resource name (e.g., "projects/my-project/topics/my-topic")
 * @returns Project ID or undefined if not in resource format
 */
export function extractProjectId(resourceName: string): string | undefined {
	const match = resourceName.match(/^projects\/([^/]+)/);
	return match?.[1];
}

/**
 * Formats a topic name to full resource format.
 * @param name Short name or full resource name
 * @param projectId Project ID for formatting
 * @returns Full resource name in format: projects/{project}/topics/{topic}
 */
export function formatTopicName(name: string, projectId: string): string {
	if (name.startsWith('projects/')) {
		return name;
	}
	return `projects/${projectId}/topics/${name}`;
}

/**
 * Formats a subscription name to full resource format.
 * @param name Short name or full resource name
 * @param projectId Project ID for formatting
 * @returns Full resource name in format: projects/{project}/subscriptions/{subscription}
 */
export function formatSubscriptionName(name: string, projectId: string): string {
	if (name.startsWith('projects/')) {
		return name;
	}
	return `projects/${projectId}/subscriptions/${name}`;
}

/**
 * Formats a schema ID to full resource format.
 * @param id Short ID or full resource name
 * @param projectId Project ID for formatting
 * @returns Full resource name in format: projects/{project}/schemas/{schema}
 */
export function formatSchemaName(id: string, projectId: string): string {
	if (id.startsWith('projects/')) {
		return id;
	}
	return `projects/${projectId}/schemas/${id}`;
}

/**
 * Formats a snapshot name to full resource format.
 * @param name Short name or full resource name
 * @param projectId Project ID for formatting
 * @returns Full resource name in format: projects/{project}/snapshots/{snapshot}
 */
export function formatSnapshotName(name: string, projectId: string): string {
	if (name.startsWith('projects/')) {
		return name;
	}
	return `projects/${projectId}/snapshots/${name}`;
}

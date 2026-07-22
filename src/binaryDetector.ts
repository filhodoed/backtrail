export const BINARY_DETECTION_SAMPLE_SIZE = 8000;

export function isBinaryContent(content: Uint8Array): boolean {
	const sampleLength = Math.min(content.length, BINARY_DETECTION_SAMPLE_SIZE);
	for (let i = 0; i < sampleLength; i++) {
		if (content[i] === 0) {
			return true;
		}
	}
	return false;
}

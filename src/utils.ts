import * as vscode from 'vscode';

export function getOrCreate<K, V>(map: Map<K, V>, key: K, factory: () => V): V {
	let value = map.get(key);
	if (value === undefined) {
		value = factory();
		map.set(key, value);
	}
	return value;
}

export function getFileName(uri: vscode.Uri): string {
    const path = uri.path;
    const segments = path.split('/');
    return segments[segments.length - 1];
}

export async function tryGetSearchTerm(uri: vscode.Uri, position: vscode.Position): Promise<string | undefined> {
	const doc = await vscode.workspace.openTextDocument(uri);
	let range = doc.getWordRangeAtPosition(position);
	if (!range) {
		range = doc.getWordRangeAtPosition(position, /[^\s]+/);
	}
	return range ? doc.getText(range) : undefined;
}

export function getPreviewChunks(doc: vscode.TextDocument, range: vscode.Range, beforeLen: number = 8, trim: boolean = true) {
	const previewStart = range.start.with({ character: Math.max(0, range.start.character - beforeLen) });
	const wordRange = doc.getWordRangeAtPosition(previewStart);
	let before = doc.getText(new vscode.Range(wordRange ? wordRange.start : previewStart, range.start));
	const inside = doc.getText(range);
	const previewEnd = range.end.translate(0, 331);
	let after = doc.getText(new vscode.Range(range.end, previewEnd));
	if (trim) {
		before = before.replace(/^\s*/g, '');
		after = after.replace(/\s*$/g, '');
	}
	return { before, inside, after };
}

export function getMatchDescription(count: number): string {
    return `${count} match${count === 1 ? '' : 'es'}`;
}

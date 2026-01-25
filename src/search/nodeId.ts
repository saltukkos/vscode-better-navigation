import * as vscode from 'vscode';

export class NodeId {
    constructor(
        public readonly type: string,
        public readonly uri: vscode.Uri | undefined,
        public readonly range?: vscode.Range
    ) {}

    public toString(): string {
        return JSON.stringify({
            type: this.type,
            uri: this.uri?.toString(),
            range: this.range ? [this.range.start.line, this.range.start.character, this.range.end.line, this.range.end.character] : undefined
        });
    }
}

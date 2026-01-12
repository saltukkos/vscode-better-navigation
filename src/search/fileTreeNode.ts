import * as vscode from 'vscode';
import * as utils from '../utils';
import { TreeNode } from './searchManager';

export class FileTreeNode implements TreeNode {
    public readonly hasChildren = true;
    public readonly icon = vscode.ThemeIcon.File;

    private _childrenPromise: Promise<TreeNode[]> | undefined;

    constructor(
        readonly uri: vscode.Uri,
        private readonly ranges: vscode.Range[],
        private readonly itemsIcon: vscode.ThemeIcon | undefined,
        public readonly label: string
    ) {
        ranges.sort((a, b) => a.start.compareTo(b.start));
    }

    async getChildren(): Promise<TreeNode[]> {
        if (this._childrenPromise !== undefined) {
            return this._childrenPromise;
        }

        this._childrenPromise = this.loadChildren();
        return this._childrenPromise;
    }

    private async loadChildren(): Promise<TreeNode[]> {
        const document = await vscode.workspace.openTextDocument(this.uri);
        const groupByMember = vscode.workspace.getConfiguration('better-navigation').get<boolean>('groupByMember', false);

        if (groupByMember) {
             return this.groupResultsByMember(document);
        }

        return this.ranges.map((range) => this.loadChild(document, range));
    }

    private async groupResultsByMember(document: vscode.TextDocument): Promise<TreeNode[]> {
        let symbols: vscode.DocumentSymbol[] | undefined;
        try {
            symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                this.uri
            );
        } catch (e) {
            // Ignore error, fallback to flat list or just 'other'
        }

        if (!symbols || symbols.length === 0) {
            // No symbols, just add all to "other" or return flat?
            // Requirement: "If there are items, that do not belong to any file member, they should fall into special 'fake' node"
            // If NO symbols at all, maybe everything is in "other"?
            // Or fallback to default view? 
            // "Depending on this setting... file structure is tree-shaped... items that do not belong... fall into special fake node"
            // It implies if grouping is ON, we should try to group.
            return [this.createFakeNode(document, this.ranges)];
        }

        // Flatten symbols to linear list for easier lookup
        const flatSymbols: vscode.DocumentSymbol[] = [];
        const traverse = (nodes: vscode.DocumentSymbol[]) => {
            for (const node of nodes) {
                flatSymbols.push(node);
                if (node.children) {
                    traverse(node.children);
                }
            }
        };
        traverse(symbols);

        // Sort symbols by range start (and end/length for stability?)
        // To find "deepest", if we sort by start, a child usually starts after parent (or same) and ends before.
        // Actually, just sorting by start is enough if we pick the *last* symbol that contains the range?
        // No, siblings might be interleaved if we just sort by start? No, siblings are disjoint.
        // Hierarchy: Parent [ ... Child [ ... ] ... ]
        // Sorted by start: Parent, Child.
        // Both contain the range inside Child.
        // If we iterate and find all matches, we want the one with smallest range?
        // Or if we sort by start, the Child comes after Parent. So the *last* matching symbol is the deepest one.
        flatSymbols.sort((a, b) => a.range.start.compareTo(b.range.start));

        const resultsByMember = new Map<vscode.DocumentSymbol, vscode.Range[]>();
        const otherRanges: vscode.Range[] = [];

        // Sort ranges to be efficient?
        // Actually, for each range, we can binary search or just linear search in symbols?
        // Given N ranges and M symbols. M is small usually.
        // Let's iterate ranges.
        for (const range of this.ranges) {
             let bestSymbol: vscode.DocumentSymbol | undefined;
             
             // Find deepest symbol containing this range.
             // Since symbols are sorted by start, and children come after parents (usually, or we can ensure that),
             // The last symbol that contains the range is the deepest one.
             // Wait, if start is same, who comes first?
             // If Parent start == Child start.
             // We want Child to be "after" to be picked as last?
             // Yes. Stable sort or explicit check.
             // Let's simple check: smallest range length.
             
             // Optimization: We could use the user's suggestion of sorting both.
             // But simple find is robust.
             for (const symbol of flatSymbols) {
                 if (symbol.range.contains(range)) {
                     // Potential candidate.
                     if (!bestSymbol) {
                         bestSymbol = symbol;
                     } else {
                         // Check if this symbol is "deeper" (smaller range)
                         // OR if it just starts later (which usually means deeper or sibling).
                         // Containment check ensures it's not a disjoint sibling.
                         // So if it contains and starts >= bestSymbol.start, it is deeper.
                         // Actually if it contains, it MUST be a child of bestSymbol (if bestSymbol also contains).
                         // So we always update bestSymbol.
                         bestSymbol = symbol;
                     }
                 }
             }

             if (bestSymbol) {
                 utils.getOrCreate(resultsByMember, bestSymbol, () => []).push(range);
             } else {
                 otherRanges.push(range);
             }
        }

        const nodes: TreeNode[] = [];

        // Create nodes for members
        // Sort members by appearance in file (they are keys in map, but map iteration order is insertion order? 
        // No, we inserted in arbitrary order of processing ranges?
        // We should sort the keys (symbols) by start position.
        const memberSymbols = Array.from(resultsByMember.keys()).sort((a, b) => a.range.start.compareTo(b.range.start));

        for (const symbol of memberSymbols) {
             const ranges = resultsByMember.get(symbol)!;
             nodes.push(this.createMemberNode(document, symbol, ranges));
        }

        // Add 'other' node if needed
        if (otherRanges.length > 0) {
            nodes.push(this.createFakeNode(document, otherRanges));
        }

        return nodes;
    }

    private createMemberNode(document: vscode.TextDocument, symbol: vscode.DocumentSymbol, ranges: vscode.Range[]): TreeNode {
         // Create children nodes (previews)
         // We can reuse loadChild but we need to return a list
         const children = ranges.map(r => this.loadChild(document, r));
         
         // Mapping SymbolKind to ThemeIcon?
         // There is no direct API for this in vscode extensions, surprisingly.
         // We can use a generic mapping or just SymbolIcon.
         // Let's use a simple mapping or default to SymbolEvent.
         // Actually `vscode.ThemeIcon` has known IDs like 'symbol-method', 'symbol-class'.
         const iconId = this.getSymbolIconId(symbol.kind);
         
         return {
             hasChildren: true,
             getChildren: async () => children,
             label: symbol.name,
             icon: new vscode.ThemeIcon(iconId),
             description: `${ranges.length} matches`,
             location: { uri: this.uri, range: symbol.range }
         };
    }

    private createFakeNode(document: vscode.TextDocument, ranges: vscode.Range[]): TreeNode {
         const children = ranges.map(r => this.loadChild(document, r));
         return {
             hasChildren: true,
             getChildren: async () => children,
             label: "(uncategorized)",
             icon: new vscode.ThemeIcon('symbol-misc'),
             description: `${ranges.length} matches`,
         };
    }

    private getSymbolIconId(kind: vscode.SymbolKind): string {
        switch (kind) {
            case vscode.SymbolKind.File: return 'symbol-file';
            case vscode.SymbolKind.Module: return 'symbol-module';
            case vscode.SymbolKind.Namespace: return 'symbol-namespace';
            case vscode.SymbolKind.Package: return 'symbol-package';
            case vscode.SymbolKind.Class: return 'symbol-class';
            case vscode.SymbolKind.Method: return 'symbol-method';
            case vscode.SymbolKind.Property: return 'symbol-property';
            case vscode.SymbolKind.Field: return 'symbol-field';
            case vscode.SymbolKind.Constructor: return 'symbol-constructor';
            case vscode.SymbolKind.Enum: return 'symbol-enum';
            case vscode.SymbolKind.Interface: return 'symbol-interface';
            case vscode.SymbolKind.Function: return 'symbol-function';
            case vscode.SymbolKind.Variable: return 'symbol-variable';
            case vscode.SymbolKind.Constant: return 'symbol-constant';
            case vscode.SymbolKind.String: return 'symbol-string';
            case vscode.SymbolKind.Number: return 'symbol-number';
            case vscode.SymbolKind.Boolean: return 'symbol-boolean';
            case vscode.SymbolKind.Array: return 'symbol-array';
            case vscode.SymbolKind.Object: return 'symbol-object';
            case vscode.SymbolKind.Key: return 'symbol-key';
            case vscode.SymbolKind.Null: return 'symbol-null';
            case vscode.SymbolKind.EnumMember: return 'symbol-enum-member';
            case vscode.SymbolKind.Struct: return 'symbol-struct';
            case vscode.SymbolKind.Event: return 'symbol-event';
            case vscode.SymbolKind.Operator: return 'symbol-operator';
            case vscode.SymbolKind.TypeParameter: return 'symbol-type-parameter';
            default: return 'symbol-misc';
        }
    }

    private loadChild(document: vscode.TextDocument, range: vscode.Range): TreeNode {
        const { before, inside, after } = utils.getPreviewChunks(document, range);

        const label: vscode.TreeItemLabel = {
            label: before + inside + after,
            highlights: [[before.length, before.length + inside.length]]
        };

        return {
            hasChildren: false,
            getChildren: async () => [],
            location: {
                uri: this.uri,
                range: range
            },
            label,
            description: `${range.start.line + 1}:${range.start.character + 1}`,
            icon: this.itemsIcon
        };
    }
}

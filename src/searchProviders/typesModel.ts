import * as vscode from 'vscode';
import { SearchModel } from './model';

export enum TypeHierarchyDirection {
    Subtypes,
    Supertypes
}

export class TypeHierarchySearchModel implements SearchModel {
    readonly title: string;
    readonly itemsIcon = new vscode.ThemeIcon('symbol-class');

    constructor(
        private readonly direction: TypeHierarchyDirection
    ) {
        this.title = direction === TypeHierarchyDirection.Subtypes ? 'Subtypes' : 'Supertypes';
    }

    async resolve(uri: vscode.Uri, selection: vscode.Selection): Promise<vscode.Location[]> {
        const items = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(
            'vscode.prepareTypeHierarchy',
            uri,
            selection.active
        );

        if (!items || items.length === 0) {
            return [];
        }

        const results: vscode.Location[] = [];
        const seen = new Set<string>();

        for (const item of items) {
            await this.collectTypes(item, results, seen);
        }

        return results;
    }

    private async collectTypes(item: vscode.TypeHierarchyItem, results: vscode.Location[], seen: Set<string>) {
        const key = `${item.uri.toString()}:${item.range.start.line}:${item.range.start.character}`;
        if (seen.has(key)) {
            return;
        }
        seen.add(key);

        results.push({
            uri: item.uri,
            range: item.range,
        });

        let children: vscode.TypeHierarchyItem[] | undefined;
        if (this.direction === TypeHierarchyDirection.Supertypes) {
            children = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>('vscode.provideSupertypes', item);
        } else {
            children = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>('vscode.provideSubtypes', item);
        }

        if (children) {
            for (const child of children) {
                await this.collectTypes(child, results, seen);
            }
        }
    }
}

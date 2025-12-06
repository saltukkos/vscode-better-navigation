import * as vscode from 'vscode';
import { SearchModel } from './model';

export class ReferencesSearchModel implements SearchModel {
    readonly title: string = 'References';
    readonly itemsIcon = undefined;

    async resolve(uri: vscode.Uri, selection: vscode.Selection): Promise<vscode.Location[]> {
        const locations = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeReferenceProvider',
            uri,
            selection.active
        );

        return locations ?? [];
    }
}

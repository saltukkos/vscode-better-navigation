import * as vscode from 'vscode';
import { SearchModel } from './model';

export class ImplementationsSearchModel implements SearchModel {
    readonly title: string = 'Implementations';
    readonly itemsIcon = undefined;

    async resolve(uri: vscode.Uri, selection: vscode.Selection): Promise<vscode.Location[]> {
        const result = await vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
            'vscode.executeImplementationProvider',
            uri,
            selection.active
        );

        if (!result) {
            return [];
        }

        const locations: vscode.Location[] = [];
        for (const item of result) {
            if (item instanceof vscode.Location) {
                locations.push(item);
            } else {
                // TODO: originSelectionRange has better representation of the member we're searching for
                // TODO: targetSelectionRange is probably a better candidate for range in some cases
                locations.push(new vscode.Location(item.targetUri, item.targetRange));
            }
        }

        return locations;
    }
}

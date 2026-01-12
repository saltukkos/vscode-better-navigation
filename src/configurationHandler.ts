import * as vscode from 'vscode';
import { SearchController } from './search/searchManager';

export class ConfigurationHandler implements vscode.Disposable {
    private readonly _disposables: vscode.Disposable[] = [];

    constructor(private readonly _searchController: SearchController) {
        this._disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => this.onConfigurationChanged(e)),
            vscode.commands.registerCommand('better-navigation.enableDirectoryGrouping', () => this.setDirectoryGrouping(true)),
            vscode.commands.registerCommand('better-navigation.disableDirectoryGrouping', () => this.setDirectoryGrouping(false))
        );
    }

    private async setDirectoryGrouping(enabled: boolean): Promise<void> {
        await vscode.workspace.getConfiguration('better-navigation').update('groupByDirectory', enabled, vscode.ConfigurationTarget.Global);
    }

    private onConfigurationChanged(e: vscode.ConfigurationChangeEvent): void {
        if (e.affectsConfiguration('better-navigation.groupByDirectory')) {
            this._searchController.rebuildActiveSearchTree();
        }
    }

    public dispose(): void {
        this._disposables.forEach(d => d.dispose());
    }
}

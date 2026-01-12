import * as vscode from 'vscode';
import { SearchController } from './search/searchManager';

export class ConfigurationHandler implements vscode.Disposable {
    private readonly _disposables: vscode.Disposable[] = [];

    constructor(private readonly _searchController: SearchController) {
        this._disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => this.onConfigurationChanged(e)),
            vscode.commands.registerCommand('better-navigation.enableDirectoryGrouping', () => this.setDirectoryGrouping(true)),
            vscode.commands.registerCommand('better-navigation.disableDirectoryGrouping', () => this.setDirectoryGrouping(false)),
            vscode.commands.registerCommand('better-navigation.enableMemberGrouping', () => this.setMemberGrouping(true)),
            vscode.commands.registerCommand('better-navigation.disableMemberGrouping', () => this.setMemberGrouping(false)),
            vscode.commands.registerCommand('better-navigation.configureExcludedMemberTypes', () => this.configureExcludedMemberTypes())
        );
    }

    private async setDirectoryGrouping(enabled: boolean): Promise<void> {
        await vscode.workspace.getConfiguration('better-navigation').update('groupByDirectory', enabled, vscode.ConfigurationTarget.Global);
    }

    private async setMemberGrouping(enabled: boolean): Promise<void> {
        await vscode.workspace.getConfiguration('better-navigation').update('groupByMember', enabled, vscode.ConfigurationTarget.Global);
    }

    private async configureExcludedMemberTypes(): Promise<void> {
        const config = vscode.workspace.getConfiguration('better-navigation');
        const currentExclusions = config.get<string>('excludedMemberTypes', '');
        const currentSet = new Set(currentExclusions.split(',').map(s => s.trim()).filter(s => s));

        // Get all SymbolKind names
        // SymbolKind is an enum, so Object.keys returns both numbers and strings. We want strings.
        const symbolKinds = Object.keys(vscode.SymbolKind)
            .filter(key => isNaN(Number(key)));

        const items: vscode.QuickPickItem[] = symbolKinds.map(kind => ({
            label: kind,
            picked: currentSet.has(kind)
        }));

        const result = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            title: 'Select Symbol Types to Exclude from Grouping'
        });

        if (result !== undefined) {
            // User accepted
            const selected = result.map(item => item.label).join(',');
            await config.update('excludedMemberTypes', selected, vscode.ConfigurationTarget.Global);
        }
    }

    private onConfigurationChanged(e: vscode.ConfigurationChangeEvent): void {
        if (e.affectsConfiguration('better-navigation.groupByDirectory') || 
            e.affectsConfiguration('better-navigation.groupByMember') ||
            e.affectsConfiguration('better-navigation.excludedMemberTypes')) {
            this._searchController.rebuildActiveSearchTree();
        }
    }

    public dispose(): void {
        this._disposables.forEach(d => d.dispose());
    }
}

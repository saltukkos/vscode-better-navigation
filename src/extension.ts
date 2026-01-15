import * as vscode from 'vscode';
import { SearchController } from './search/searchManager';
import { SearchView } from './search/searchView';
import { TabView } from './search/tabView';
import { ReferencesSearchModel } from './searchProviders/referencesModel';
import { TypeHierarchySearchModel, TypeHierarchyDirection } from './searchProviders/typesModel';

import { ConfigurationHandler } from './configurationHandler';
import { ImplementationsSearchModel } from './searchProviders/implementationsModel';

export function activate(context: vscode.ExtensionContext): void {
    const controller = new SearchController();
    context.subscriptions.push(controller);

    const configurationHandler = new ConfigurationHandler(controller);
    context.subscriptions.push(configurationHandler);

    const searchView = new SearchView(controller);
    context.subscriptions.push(vscode.window.registerTreeDataProvider('better-navigation.tree', searchView));
    context.subscriptions.push(searchView);

    const tabView = new TabView(context.extensionUri, controller);
    context.subscriptions.push();

    const referencesModel = new ReferencesSearchModel();
    const supertypesModel = new TypeHierarchySearchModel(TypeHierarchyDirection.Supertypes);
    const subtypesModel = new TypeHierarchySearchModel(TypeHierarchyDirection.Subtypes);
    const implementationsModel = new ImplementationsSearchModel();

    context.subscriptions.push(
        vscode.commands.registerCommand('better-navigation.findReferences', async () => {
            await controller.runSearch(referencesModel);
        }),
        vscode.commands.registerCommand('better-navigation.showSupertypes', async () => {
            await controller.runSearch(supertypesModel);
        }),
        vscode.commands.registerCommand('better-navigation.showSubtypes', async () => {
            await controller.runSearch(subtypesModel);
        }),
        vscode.commands.registerCommand('better-navigation.showImplementations', async () => {
            await controller.runSearch(implementationsModel);
        })
    );
}


import * as vscode from 'vscode';
import { SearchController } from './search/searchManager';
import { SearchView } from './search/searchView';
import { TabView } from './search/tabView';
import { ReferencesSearchModel } from './searchProviders/referencesModel';
import { TypeHierarchySearchModel, TypeHierarchyDirection } from './searchProviders/typesModel';

import { ConfigurationHandler } from './configurationHandler';
import { ImplementationsSearchModel } from './searchProviders/implementationsModel';
import { AutoNavigateController } from './search/autoNavigateController';

export function activate(context: vscode.ExtensionContext): void {
    const autoNavigateController = new AutoNavigateController();
    context.subscriptions.push(autoNavigateController);

    const searchController = new SearchController(autoNavigateController);
    context.subscriptions.push(searchController);

    const configurationHandler = new ConfigurationHandler(searchController);
    context.subscriptions.push(configurationHandler);

    const searchView = new SearchView(searchController);
    context.subscriptions.push(searchView);

    const tabView = new TabView(context.extensionUri, searchController);
    context.subscriptions.push();

    const referencesModel = new ReferencesSearchModel();
    const supertypesModel = new TypeHierarchySearchModel(TypeHierarchyDirection.Supertypes);
    const subtypesModel = new TypeHierarchySearchModel(TypeHierarchyDirection.Subtypes);
    const implementationsModel = new ImplementationsSearchModel();

    context.subscriptions.push(
        vscode.commands.registerCommand('better-navigation.findReferences', async () => {
            await searchController.runSearch(referencesModel);
        }),
        vscode.commands.registerCommand('better-navigation.showSupertypes', async () => {
            await searchController.runSearch(supertypesModel);
        }),
        vscode.commands.registerCommand('better-navigation.showSubtypes', async () => {
            await searchController.runSearch(subtypesModel);
        }),
        vscode.commands.registerCommand('better-navigation.showImplementations', async () => {
            await searchController.runSearch(implementationsModel);
        }),
        vscode.commands.registerCommand('better-navigation.nextResult', async () => {
            await searchView.goToFollowingResult(true);
        }),
        vscode.commands.registerCommand('better-navigation.previousResult', async () => {
            await searchView.goToFollowingResult(false);
        }),
        vscode.commands.registerCommand('better-navigation.expandAll', async () => {
            await searchView.expandAll();
        })
    );
}


import * as vscode from 'vscode';

export interface SearchModel {
    readonly title: string;
    readonly itemsIcon: vscode.ThemeIcon | undefined;
    resolve(uri: vscode.Uri, selection: vscode.Selection): Promise<vscode.Location[]>;
}

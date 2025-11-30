/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Modified by Konstantin Saltuk. All modifications licensed under the MIT License.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Support for symbol navigation (next/previous).
 */
export interface SymbolItemNavigation<T> {
	/**
	 * Return the item that is the nearest to the given location or `undefined`
	 */
	nearest(uri: vscode.Uri, position: vscode.Position): T | undefined;
	/**
	 * Return the next item from the given item or the item itself.
	 */
	next(from: T): T;
	/**
	 * Return the previous item from the given item or the item itself.
	 */
	previous(from: T): T;
	/**
	 * Return the location of the given item.
	 */
	location(item: T): vscode.Location | undefined;
}

/**
 * Support for editor highlights.
 */
export interface SymbolItemEditorHighlights<T> {
	/**
	 * Given an item and an uri return an array of ranges to highlight.
	 */
	getEditorHighlights(item: T, uri: vscode.Uri): vscode.Range[] | undefined;
}

export interface SymbolItemDragAndDrop<T> {

	getDragUri(item: T): vscode.Uri | undefined;
}

/**
 * Model used to populate the symbol tree view.
 */
export interface SymbolTreeModel<T> {

	/**
	 * A tree data provider which is used to populate the symbols tree.
	 */
	provider: vscode.TreeDataProvider<T>;

	/**
	 * An optional message that is displayed above the tree. Whenever the provider
	 * fires a change event this message is read again.
	 */
	message: string | undefined;

	/**
	 * Optional support for symbol navigation. When implemented, navigation commands like
	 * "Go to Next" and "Go to Previous" will be working with this model.
	 */
	navigation?: SymbolItemNavigation<T>;

	/**
	 * Optional support for editor highlights. WHen implemented, the editor will highlight
	 * symbol ranges in the source code.
	 */
	highlights?: SymbolItemEditorHighlights<T>;

	/**
	 * Optional support for drag and drop.
	 */
	dnd?: SymbolItemDragAndDrop<T>;

	/**
	 * Optional dispose function which is invoked when this model is
	 * needed anymore
	 */
	dispose?(): void;
}

/**
 * Input for populating the symbol tree view.
 * Inputs are anchored at a code location and resolve to a model containing the actual data.
 */
export interface SymbolTreeInput<T> {

	/**
	 * The value of the `reference-list.source` context key. Use this to control
	 * input dependent commands.
	 */
	readonly contextValue: string;

	/**
	 * The (short) title of this input, like "Implementations" or "Callers Of"
	 */
	readonly title: string;

	/**
	 * The location at which this position is anchored. Locations are validated and inputs
	 * with "funny" locations might be ignored
	 */
	readonly location: vscode.Location;

	/**
	 * Resolve this input to a model that contains the actual data. When there are no result
	 * than `undefined` or `null` should be returned.
	 */
	resolve(): vscode.ProviderResult<SymbolTreeModel<T>>;

	/**
	 * This function is called when re-running from history. The symbols tree has tracked
	 * the original location of this input and that is now passed to this input. The
	 * implementation of this function should return a clone where the `location`-property
	 * uses the provided `location`
	 *
	 * @param location The location at which the new input should be anchored.
	 * @returns A new input which location is anchored at the position.
	 */
	with(location: vscode.Location): SymbolTreeInput<T>;
}

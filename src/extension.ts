/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Modified by Konstantin Saltuk. All modifications licensed under the MIT License.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as calls from './calls';
import * as references from './references';
import { SymbolsTree } from './tree';
import * as types from './types';

export function activate(context: vscode.ExtensionContext): void {

	const tree = new SymbolsTree(context);

	references.register(tree, context);
	calls.register(tree, context);
	types.register(tree, context);
}

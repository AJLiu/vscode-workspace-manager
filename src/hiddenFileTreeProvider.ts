import * as vscode from 'vscode';
import * as path from 'path';
import { getIconForFile } from 'vscode-icons-js';
import { assert } from 'console';


interface INode {
    readonly uri: vscode.Uri;
}

function strippedPath(nodeOrUri: HiddenFileNode | vscode.Uri) {
    let uri: vscode.Uri;
    if (nodeOrUri instanceof HiddenFileNode) {
        uri = nodeOrUri.uri;
    } else {
        uri = nodeOrUri;
    }
    const basePath = vscode.workspace.rootPath + '/';
    return uri.path.replace(basePath, '');
}

export class HiddenFileNode implements INode {
    children: HiddenFileNode[] | undefined = undefined;
    collapsibleState = vscode.TreeItemCollapsibleState.None;

    constructor(
        public readonly uri: vscode.Uri,
        public readonly isFolder: boolean,
        public readonly parent: HiddenFileNode | undefined,
        public isHidden: boolean
    ) {
        if (isFolder) {
            if (parent === undefined) {
                this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            } else {
                this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            }
        }
    }

    getPath() {
        return strippedPath(this);
    }
}

class Root extends HiddenFileNode {
    constructor() {
        super(vscode.Uri.file(''), true, undefined, false);
    }
}

export class HiddenFileExplorerProvider implements vscode.TreeDataProvider<INode> {
    private _onDidChangeTreeData: vscode.EventEmitter<INode | undefined> = new vscode.EventEmitter<INode | undefined>();
    readonly onDidChangeTreeData: vscode.Event<INode | undefined> = this._onDidChangeTreeData.event;

    private hiddenFiles: Set<string> = new Set();
    private nodes: Record<string, HiddenFileNode> = {};

    public showHidden = true;
    constructor() {}

    refresh(node: INode | undefined = undefined): void {
        this._onDidChangeTreeData.fire(node);
    }

    syncOnFileDeleted(deleted: vscode.Uri) {
        const node = this.getNode(deleted);
        const parent = node.parent;
        const toDelete = [node];
        while (toDelete.length !== 0) {
            const next = toDelete.pop();
            if (next === undefined) {
                break;
            }
            if (next?.children !== undefined) {
                toDelete.push(...next?.children);
            }
            delete this.nodes[next.uri.toString()];
        }
        this.refresh(parent);
    }

    register() {
        return vscode.window.createTreeView(
            'workspace-manager.browser',
            {
                "canSelectMany": false,
                "showCollapseAll": true,
                "treeDataProvider": this
            }
        );
    }

    setHiddenFiles(hiddenFiles: string[]) {
        this.hiddenFiles = new Set(hiddenFiles);
    }

    getTreeItem(node: INode): vscode.TreeItem {
        return new ExplorerTreeItem(this.nodes[node.uri.toString()]);
    }

    getNode(uri: vscode.Uri | undefined) {
        if (uri === undefined) {
            return this.nodes[''];
        }
        return this.nodes[uri.toString()];
    }

    clear() {
        this.nodes = {};
    }

    async getParent({uri}: INode): Promise<HiddenFileNode | undefined> {
        return this.nodes[uri.toString()].parent;
    }

    async getChildren(element?: INode): Promise<HiddenFileNode[]> {
        let children: HiddenFileNode[];
        if (element === undefined) {
            if ('' in this.nodes && this.nodes[''].children !== undefined) {
                children = this.nodes[''].children;
                // Update isHidden value in children
                for (const child of children) {
                    child.isHidden = this.hiddenFiles.has(strippedPath(child));
                }
            } else {
                const root = new Root();
                this.nodes[''] = root;
                root.children = [];
                const workspaceFolders = vscode.workspace.workspaceFolders || [];
                for (const folder of workspaceFolders) {
                    const isHidden = this.hiddenFiles.has(strippedPath(folder.uri));
                    const node = new HiddenFileNode(folder.uri, true, undefined, isHidden);
                    this.nodes[folder.uri.toString()] = node;
                    root.children.push(node);
                }
                // case for single root workspace folder
                if (workspaceFolders.length === 1) {
                    this.nodes[''] = root.children[0];
                    return this.getChildren(this.nodes['']);
                }
                children = root.children;
            }
        } else {
            const root = this.nodes[element.uri.toString()];
            if (root === undefined || !root.isFolder) {
                children = [];
            } else if (root.children !== undefined) {
                children = root.children;
                // Update isHidden value in children
                for (const child of children) {
                    child.isHidden = root.isHidden || this.hiddenFiles.has(strippedPath(child));
                }
            } else {
                const files = await vscode.workspace.fs.readDirectory(element.uri);
                const childrenDirs = [];
                const childrenFiles = [];
                for (const [name, filetype] of files) {
                    const uri = vscode.Uri.joinPath(element.uri, name);
                    const isHidden = root.isHidden || this.hiddenFiles.has(strippedPath(uri));

                    let node;
                    if (filetype === vscode.FileType.Directory || filetype === vscode.FileType.SymbolicLink) {
                        node = new HiddenFileNode(uri, true, root, isHidden);
                        childrenDirs.push(node);
                    } else {
                        node = new HiddenFileNode(uri, false, root, isHidden);
                        childrenFiles.push(node);
                    }
                    this.nodes[uri.toString()] = node;
                }
                root.children = [...childrenDirs, ...childrenFiles];
                children = root.children;
            }
        }
        if (!this.showHidden) {
            return children.filter((node) => !node.isHidden);
        }

        return children;
    }
}


class ExplorerTreeItem extends vscode.TreeItem {

    constructor(private node: HiddenFileNode) {
        super(
            strippedPath(node).split('/').pop() || '[UNKNOWN FILE]',
            node.collapsibleState
        );
        const name = this.label || '[UNKNOWN FILE]';
        if (node.isHidden) {
            this.contextValue = 'hidden';
            this.description = name;
            this.label = '';
            this.command = {
                command: 'workspace-manager.browser.showFile',
                title: 'Toggle ' + name,
                arguments: [node]
            };
        } else {
            this.contextValue = 'visible';
            this.command = {
                command: 'workspace-manager.browser.hideFile',
                title: 'Toggle ' + name,
                arguments: [node]
            };
        }

        this.resourceUri = node.uri;
        this.id = strippedPath(node.uri);

        if (!node.isFolder) {
            const file = getIconForFile(name) || 'default_file.svg';
            this.iconPath = path.join(__filename, '../../resources/file_icons', file);
        }
    }
}

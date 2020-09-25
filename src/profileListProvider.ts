import * as vscode from 'vscode';
import * as path from 'path';
import { getIconForFile } from 'vscode-icons-js';
import { assert } from 'console';


export class ProfileListProvider implements vscode.TreeDataProvider<string | true> {
    private _onDidChangeTreeData: vscode.EventEmitter<string | true | undefined> = new vscode.EventEmitter<string | true | undefined>();
    readonly onDidChangeTreeData: vscode.Event<string | true | undefined> = this._onDidChangeTreeData.event;

    public showHidden = true;
    constructor() { }

    register() {
        return vscode.window.createTreeView(
            'workspace-manager.profiles',
            {
                "canSelectMany": false,
                "showCollapseAll": false,
                "treeDataProvider": this
            }
        );
    }

    refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(profileId: string | true): vscode.TreeItem {
        const config = vscode.workspace.getConfiguration('workspace-manager');
        const selectedProfileId = config.get('selected-profile');
        let profileType = ProfileType.create;
        if (profileId === selectedProfileId) {
            profileType = ProfileType.selected;
        } else if (profileId !== true) {
            profileType = ProfileType.unselected;
        }
        return new ProfileTreeItem(profileId, profileType);
    }

    async getChildren(element?: string | undefined): Promise<(string | true)[]> {
        if (element !== undefined) {
            return [];
        }
        const config = vscode.workspace.getConfiguration('workspace-manager');
        const profiles = config.get<Record<string, any>>('profiles') || {};
        const children: (string | true)[] = Object.keys(profiles);
        // add a dummy node as a 'create' button.
        children.push(true);
        return children;
    }
}

enum ProfileType {
    create = 0,
    selected = 1,
    unselected = 2
}

class ProfileTreeItem extends vscode.TreeItem {
    constructor(private profileId: string | true, type: ProfileType = ProfileType.create) {
        super(
            profileId === true ? '' : profileId,
            vscode.TreeItemCollapsibleState.None
        );
        const name = this.label || '[UNKNOWN FILE]';
        if (type === ProfileType.selected) {
            this.contextValue = 'selected';
            this.description = '(Currently Selected)';
            this.iconPath = new vscode.ThemeIcon('star-full');
        } else if (type === ProfileType.unselected) {
            this.contextValue = 'unselected';
            this.command = {
                command: 'workspace-manager.profiles.switch',
                title: 'Switch profile to ' + name,
                arguments: [profileId === true ? undefined : profileId]
            };
        } else {
            this.contextValue = 'create';
            this.label = 'Create';
            this.command = {
                command: 'workspace-manager.profiles.create',
                title: 'Create a new profile'
            };
            this.iconPath = new vscode.ThemeIcon('add');
        }

        this.id = profileId === true ? '' : profileId;
    }
}

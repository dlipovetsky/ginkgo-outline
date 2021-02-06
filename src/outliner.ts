'use strict';

import * as vscode from 'vscode';
import * as cp from 'child_process';

export interface Outline {
    nested: GinkgoNode[];
    flat: GinkgoNode[];
}

export interface GinkgoNode {
    // Metadata
    // Keep in sync with https://github.com/onsi/ginkgo/tree/master/ginkgo/outline
    name: string;
    text: string;
    start: number;
    end: number;
    spec: boolean;
    focused: boolean;
    pending: boolean;

    nodes: GinkgoNode[];
    parent: GinkgoNode;
}

export function preOrder(node: GinkgoNode, f: Function): void {
    f(node);
    if (node.nodes) {
        for (let c of node.nodes) {
            preOrder(c, f);
        }
    }
}

export class Outliner {

    constructor(public ginkgoPath: string) { };

    // fromDocument returns the ginkgo outline for the TextDocument. It calls ginkgo
    // as an external process.
    public async fromDocument(doc: vscode.TextDocument): Promise<Outline> {
        const output: string = await callGinkgoOutline(this.ginkgoPath, doc);
        return fromJSON(output);
    }

}

export const ginkgoImportsNotFoundError = "error creating outline: file does not import \"github.com/onsi/ginkgo\" or \"github.com/onsi/ginkgo/extensions/table\"";

export function isGinkgoImportsNotFoundError(err: Error): boolean {
    if (!err.message) {
        return false;
    }
    return err.message.indexOf(ginkgoImportsNotFoundError) > 0;
}

export async function callGinkgoOutline(ginkgoPath: string, doc: vscode.TextDocument): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
        const p = cp.execFile(ginkgoPath, ['outline', '--format=json', '-'], {}, (err, stdout, stderr) => {
            if (err) {
                let msg = `error running "${err.cmd}"`;
                if (err.code) {
                    msg += ` (error code ${err.code})`;
                }
                if (stderr) {
                    msg += `: ${stderr}`;
                }
                return reject(new Error(msg));
            }
            const outline = stdout.toString();
            return resolve(outline);
        });
        if (p.pid) {
            if (!p.stdin) {
                return reject(new Error(`unable to write to stdin of ginkgo process: pipe does not exist`));
            }
            p.stdin.end(doc.getText());
        }
    });
}

export function fromJSON(input: string): Outline {
    const nested: GinkgoNode[] = JSON.parse(input);

    const flat: GinkgoNode[] = [];
    for (let n of nested) {
        preOrder(n, function (n: GinkgoNode) {
            // Construct the "flat" list of nodes
            flat.push(n);

            // Annotate every child with its parent
            for (let c of n.nodes) {
                c.parent = n;
            }
        });
    }

    return { nested, flat };
}
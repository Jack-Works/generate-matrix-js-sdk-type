import { Project } from 'ts-morph'
import { tryReplace } from './fixForCrashes'
import { join } from 'path'

/**
 * There is a pattern in the generated code like the following
 * ```ts
 * const _X = X;
 * export { _X as X };
 * ```
 * This kind of re-export will break the TypeScript analyser
 * and reports:
 *  Declaration emit for this file requires using private name 'X' from module
 * An explicit type annotation may unblock declaration emit.
 */
const pattern = /export \{ _(.+?) as (.+?) \}/g
export function afterFixes(project: Project, matrixRoot: string) {
    tryReplace(project, join(matrixRoot, 'http-api.js'), x =>
        // A required parameter cannot follow an optional parameter.
        x.replace(
            /@param {Object} data The HTTP JSON body./g,
            `@param {Object} [data] The HTTP JSON body.`
        )
    )
    tryReplace(project, join(matrixRoot, 'store/memory.js'), x =>
        // broken export not fixed
        x.replace(
            `module.exports.MemoryStore = MemoryStore;`,
            `export { MemoryStore }`
        )
    )
    // Fix "Promise" is a private symbol.
    tryReplace(
        project,
        join(matrixRoot, 'client.js'),
        x =>
            `export const Promise_: typeof globalThis['Promise'] = globalThis.Promise; export type Promise_<T = any> = Promise<T>;` +
            x
                .replace(/module:client.Promise/g, 'Promise')
                .replace(/Promise/g, 'Promise_')
                // A required parameter cannot follow an optional parameter.
                .replace(
                    /@param {module:client.callback} callback Optional./g,
                    `@param {module:client.callback} [callback] Optional.`
                )
                .replace(
                    /@param {string\[\]} userIds/g,
                    `@param {string[]} [userIds]`
                )
    )
    for (let sourceFile of project.getSourceFiles()) {
        const allBreakingExports: string[] = Array.from(
            // @ts-ignore
            sourceFile.getText().matchAll(pattern) as string[]
        ).map(x => x[1])
        allBreakingExports
            .map(
                x =>
                    sourceFile.getClass(x) ||
                    sourceFile.getFunction(x) ||
                    sourceFile.getVariableStatement(x)
            )
            .forEach(x => {
                if (!x) return
                x.replaceWithText('export ' + x.getText(true))
            })
        tryReplace(project, sourceFile.getFilePath(), x =>
            x
                // JSDoc style type reference
                .replace(/{\?module:.+?}/g, `{any}`)
                .replace(pattern, '')
        )
    }
}

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
    for (let sourceFile of project.getSourceFiles()) {
        // @ts-ignore
        const allBreakingExports: string[] = Array.from(sourceFile.getText().matchAll(pattern)).map(x => x[1])
        allBreakingExports
            .map(x => sourceFile.getClass(x) || sourceFile.getFunction(x) || sourceFile.getVariableStatement(x))
            .forEach(x => {
                if (!x) return
                x.replaceWithText('export ' + x.getText(true))
            })
        if (allBreakingExports.length) tryReplace(project, sourceFile.getFilePath(), x => x.replace(pattern, ''))
    }
    tryReplace(project, join(matrixRoot, 'store/memory.js'), x =>
        x.replace(`module.exports.MemoryStore = MemoryStore;`, `export { MemoryStore }`)
    )
    // Fix "Promise" is a private symbol.
    tryReplace(
        project,
        join(matrixRoot, 'client.js'),
        x =>
            `const Promise_ = globalThis.Promise; type Promise_<T = any> = Promise_<T>` +
            x.replace(/module:client.Promise/g, 'Promise').replace(/Promise/g, 'Promise_')
    )
}

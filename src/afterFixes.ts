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
export function afterFixes(project: Project) {
    for (let sourceFile of project.getSourceFiles()) {
        const allBreakingExports: string[] = Array.from(
            // @ts-ignore
            sourceFile.getFullText().matchAll(pattern) as string[]
        ).map(x => x[1])
        allBreakingExports
            .map(x => sourceFile.getClass(x) || sourceFile.getFunction(x) || sourceFile.getVariableStatement(x))
            .forEach(x => {
                if (!x) return
                x.replaceWithText('export ' + x.getText(true))
            })
        tryReplace(project, sourceFile.getFilePath(), x =>
            x
                // JSDoc style type reference
                .replace(/{\??module:.+?}/g, `{any}`)
                .replace(pattern, '')
        )
    }
}

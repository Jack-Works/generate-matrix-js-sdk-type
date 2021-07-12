import { Project } from 'ts-morph'
import { tryReplace } from './fixForCrashes'

/**
 * Patch all JSDoc style type reference to any
 */
export function afterFixes(project: Project) {
    for (let sourceFile of project.getSourceFiles()) {
        tryReplace(project, sourceFile.getFilePath(), (x) =>
            x
                // JSDoc style type reference
                .replace(/{\??module:.+?}/g, `{any}`)
        )
    }
}

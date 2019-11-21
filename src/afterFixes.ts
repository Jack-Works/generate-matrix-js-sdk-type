import { Project, ts, VariableStatement, TypeGuards } from 'ts-morph'
import { tryReplace } from './fixForCrashes'
import { join } from 'path'

export function afterFixes(project: Project, matrixRoot: string) {
    // for (let sourceFiles of project.getSourceFiles()) {
    // }
    tryReplace(project, join(matrixRoot, 'store/memory.js'), x =>
        x.replace(`module.exports.MemoryStore = MemoryStore;`, `export { MemoryStore }`)
    )
}

import { join } from 'path'
import { Project, ClassDeclaration, SourceFile } from 'ts-morph'
import { SourceFileReplacer } from './SourceFileReplacer'

export function dtsFixes(dtsRoot: string) {
    const dtsProject = new Project({
        compilerOptions: {}
    })
    dtsProject.addSourceFilesAtPaths(join(dtsRoot, '**/*.d.ts'))
    for (const each of dtsProject.getSourceFiles().map(x => new SourceFileReplacer(x))) {
        const path = each.sourceFile.getFilePath()
        each.touchSourceFile(s => {
            /**
             * Fix import { EventEmitter } from 'node_modules/@types/node/events'
             */
            const i = s
                .getImportDeclarations()
                .filter(x => x.getModuleSpecifierValue().endsWith('node_modules/@types/node/events'))
            i.forEach(x => x.setModuleSpecifier('events'))
            // Fix: https://github.com/microsoft/TypeScript/issues/35932
            removeExtraMethods(s)
        })
    }
    dtsProject.saveSync()
}
/**
 * Hack to the bug of: https://github.com/microsoft/TypeScript/issues/35932
 * @param class_ ClassDeclaration
 * @param superName Extends
 */
function removeExtraMethods(sourceFile: SourceFile) {
    const c = sourceFile.getClasses()
    for (const class_ of c) {
        for (const each of eventEmitterMethods) {
            class_.getMethod(each)?.remove()
        }
    }
}

const eventEmitterMethods = [
    'addListener',
    'on',
    'once',
    'prependListener',
    'prependOnceListener',
    'removeListener',
    'off',
    'removeAllListeners',
    'setMaxListeners'
] as const

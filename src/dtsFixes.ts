import { join } from 'path'
import { Project, ClassDeclaration, SourceFile } from 'ts-morph'
import { SourceFileReplacer } from './SourceFileReplacer'

export function dtsFixes(dtsRoot: string) {
    const dtsProject = new Project({
        compilerOptions: {}
    })
    dtsProject.addSourceFilesAtPaths(join(dtsRoot, '**/*.d.ts'))
    for (const each of dtsProject
        .getSourceFiles()
        .map(x => new SourceFileReplacer(x))) {
        const path = each.sourceFile.getFilePath()
        if (path.endsWith('client.d.ts')) {
            each.replace(x =>
                /**
                 * Original bad output: prepareKeyBackupVersion(password: string, { secureSecretStorage }: boolean)
                 */
                x.replace(
                    /prepareKeyBackupVersion\(password: string, .+\): Promise/g,
                    'prepareKeyBackupVersion(password: string, opts?: { secureSecretStorage: boolean }): Promise'
                )
            )
            each.apply()
        }
        each.touchSourceFile(s => {
            /**
             * Fix import { EventEmitter } from 'node_modules/@types/node/events'
             */
            const i = s
                .getImportDeclarations()
                .filter(x =>
                    x
                        .getModuleSpecifierValue()
                        .endsWith('node_modules/@types/node/events')
                )
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
        const super_ = class_.getExtends()
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

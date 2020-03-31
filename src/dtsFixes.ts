import { join } from 'path'
import { Project, SourceFile } from 'ts-morph'
import { SourceFileReplacer } from './SourceFileReplacer'

export function dtsFixes(dtsRoot: string) {
    const dtsProject = new Project({
        compilerOptions: {}
    })
    dtsProject.addSourceFilesAtPaths(join(dtsRoot, '**/*.d.ts'))
    for (const each of dtsProject.getSourceFiles().map(x => new SourceFileReplacer(x))) {
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
        each.replace(sf => {
            return sf
                .split('\n')
                .map(x => {
                    if (x.startsWith('export const')) return x
                    return x.replace(/typeof /g, '')
                })
                .join('\n')
                .replace(/import \* as (.+)deviceinfo/, 'import $1deviceinfo')
                .replace(/import \* as (.+)VerificationRequest/, 'import $1VerificationRequest')
                .replace(
                    'export class MatrixClient ',
                    'import {EventEmitter} from "events";\nexport class MatrixClient extends EventEmitter '
                )
        })
        each.apply()
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

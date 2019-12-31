import { readFileSync, writeFileSync } from 'fs'
import { log } from './log'
import { join } from 'path'
import { Project } from 'ts-morph'
import { SourceFileReplacer } from './SourceFileReplacer'

export function dtsFixes(dtsRoot: string) {
    const dtsProject = new Project({
        compilerOptions: {}
    })
    dtsProject.addSourceFilesAtPaths(join(dtsRoot, '**/*.d.ts'))
    for (const each of dtsProject
        .getSourceFiles()
        .map(x => new SourceFileReplacer(x))) {
        if (each.sourceFile.getFilePath().endsWith('client.d.ts')) {
            each.replace(x =>
                x.replace(
                    /prepareKeyBackupVersion\(password: string, .+\): Promise/g,
                    'prepareKeyBackupVersion(password: string, opts?: { secureSecretStorage: boolean }): Promise'
                )
            )
            each.apply()
        }
        each.touchSourceFile(s => {
            const i = s
                .getImportDeclarations()
                .filter(x =>
                    x
                        .getModuleSpecifierValue()
                        .endsWith('node_modules/@types/node/events')
                )
            i.forEach(x => x.setModuleSpecifier('events'))
        })
    }
    dtsProject.saveSync()
}

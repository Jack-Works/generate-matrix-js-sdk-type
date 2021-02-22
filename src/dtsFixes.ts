import { join } from 'path'
import { Project, SourceFile } from 'ts-morph'
import { SourceFileReplacer } from './SourceFileReplacer'

export function dtsFixes(dtsRoot: string) {
    const dtsProject = new Project({
        compilerOptions: {},
    })
    dtsProject.addSourceFilesAtPaths(join(dtsRoot, '**/*.d.ts'))
    let added = false
    for (const each of dtsProject.getSourceFiles().map((x) => new SourceFileReplacer(x))) {
        each.touchSourceFile((s) => {
            for (const i of s.getImportDeclarations()) {
                if (!i.compilerNode.importClause) i.remove()
            }
            /**
             * Fix import { EventEmitter } from 'node_modules/@types/node/events'
             */
            const i = s
                .getImportDeclarations()
                .filter((x) => x.getModuleSpecifierValue().endsWith('node_modules/@types/node/events'))
            i.forEach((x) => x.setModuleSpecifier('events'))
            if (!added && each.sourceFile.getFilePath().endsWith('index.ts')) {
                added = true
                s.addImportDeclaration({ moduleSpecifier: './@types/global.d' })
            }
        })
        each.replace((sf) => {
            return (
                sf
                    .replace(/import \* as (.+)deviceinfo/, 'import $1deviceinfo')
                    .replace(/import \* as (.+)VerificationRequest/, 'import $1VerificationRequest')
                    .replace(
                        'export class MatrixClient ',
                        'import {EventEmitter} from "events";\nexport class MatrixClient extends EventEmitter '
                    )
                    // The original file has a SAS value import
                    // Therefor the type import has been renamed to SAS_1
                    // After the dts generation, the value import is gone therefore it's a type error.
                    .replace(
                        `import { SAS as SAS_1 } from "./verification/SAS";`,
                        `import { SAS } from "./verification/SAS";`
                    )
                    .replace('import MatrixEvent from', 'import { MatrixEvent } from')
                    .replace(`Promise<import(`, `Promise<typeof import(`)
                    .replace(/Olm.PkSigning/g, 'any')
                    .replace('Array<Array<string, string>>', 'string[][]')
            )
        })
        each.apply()
    }
    dtsProject.saveSync()
}

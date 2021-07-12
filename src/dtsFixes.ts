import { join } from 'path'
import { Project } from 'ts-morph'
import { SourceFileReplacer } from './SourceFileReplacer'

export function dtsFixes(dtsRoot: string) {
    const dtsProject = new Project({
        compilerOptions: {},
    })
    dtsProject.addSourceFilesAtPaths(join(dtsRoot, '**/*.d.ts'))
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
                    .replace(`Promise<import(`, `Promise<typeof import(`)
                    .replace(/Olm.PkSigning/g, 'any')
                    .replace('Array<Array<string, string>>', 'string[][]')
                    .replace(
                        'getAccountData(eventType: EventType | string): MatrixEvent;',
                        'getAccountData(eventType: EventType | string): MatrixEvent | undefined;'
                    )
                    .replace(/from ".+matrix-js-sdk\/src\//, 'from "./')
                    .replace('import OlmDevice from', 'import {OlmDevice} from')
                    .replace('import { Base as Verification } from', 'import { VerificationBase as Verification } from')
                    .replace('setSinkId(outputId: string);', 'setSinkId(outputId: string): Promise<void>;')
                    .replace(/implements CryptoStore/g, '')
                    .replace(/\<DesktopCapturerSource\>/g, `<{id: string;name: string;thumbnailURL: string;}>`)
            )
        })
        each.apply()
    }
    dtsProject.saveSync()
}

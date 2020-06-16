import { Project } from 'ts-morph'
import { SourceFileReplacer } from './SourceFileReplacer'
import { log } from './log'

export function preFix(project: Project, matrixRoot: string) {
    for (const _ of project.getSourceFiles().map((x) => new SourceFileReplacer(x))) {
        const path = _.sourceFile.getFilePath()
        log(`Run prefix for: ${path}`)

        if (path.endsWith('client.js')) {
            // Let TypeScript compiler recognize it as a type definition
            _.replace((x) => x.replace(`@callback module:client.callback`, '@callback callback'))
        } else if (path.endsWith('base.js')) {
            _.replace((x) =>
                x
                    // {Object.<string, function(new: module:modulePath.ExportPath)>}
                    // => {Record.<string, module:modulePath.ExportPath)>}
                    .replace(/Object..string. function.new: module:(.+)\)./g, `Record<string, module:$1>`)
                    // https://matrix-org.github.io/matrix-js-sdk/5.2.0/module-crypto_store_base-CryptoStore.html
                    // it's an empty interface
                    .replace(/module:crypto.store.base~CryptoStore/g, '{}')
            )
        } else if (path.endsWith('QRCode.js')) {
            _.replace((x) => x.replace('return "m.reciprocate.v1";', 'return "m.reciprocate.v1" as const;'))
        } else if (path.endsWith('SAS.js')) {
            _.replace((x) => x.replace('return "m.sas.v1";', 'return "m.sas.v1" as const;'))
        } else if (path.includes('CrossSigning')) {
            _.replace((x) => x.replace(`export const CrossSigningLevel = {
    MASTER: 4,
    USER_SIGNING: 2,
    SELF_SIGNING: 1,
};`, `export enum CrossSigningLevel {
    MASTER = 4,
    USER_SIGNING = 2,
    SELF_SIGNING = 1,
}`))
        } else if (path.includes('base-apis')) {
            _.replace((x) => x.replace(`Array.<Array.<string, string>>`, 'string[][]'))
        }
        _.apply()
    }
    console.log('Prefix done.')
}

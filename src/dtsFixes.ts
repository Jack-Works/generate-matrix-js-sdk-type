import { readFileSync, writeFileSync } from 'fs'
import { log } from './log'
import { join } from 'path'

export function dtsFixes(dtsRoot: string) {
    change('client.d.ts', x =>
        x.replace(
            /prepareKeyBackupVersion\(password: string, .+\): Promise/g,
            'prepareKeyBackupVersion(password: string, opts?: { secureSecretStorage: boolean }): Promise'
        )
    )

    function change(_: string, cb: (str: string) => string) {
        const r = join(dtsRoot, _)
        log('Patching ', r)
        const s = readFileSync(r, 'utf-8')
        const f = cb(s)
        writeFileSync(r, f, 'utf-8')
    }
}

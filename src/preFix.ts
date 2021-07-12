import { Project } from 'ts-morph'
import { SourceFileReplacer } from './SourceFileReplacer'
import { log } from './log'

export function preFix(project: Project, matrixRoot: string) {
    for (const _ of project.getSourceFiles().map((x) => new SourceFileReplacer(x))) {
        const path = _.sourceFile.getFilePath()

        if (path.endsWith('index.ts')) {
            _.replace((x) => '/// <reference path="./@types/global.d" />\n' + x)
        } else if (path.endsWith('QRCode.js')) {
            _.replace((x) => x.replace('return "m.reciprocate.v1";', 'return "m.reciprocate.v1" as const;'))
        } else if (path.endsWith('client.ts')) {
            _.replace((x) =>
                x.replace(`[key: string]: string | number;`, `[key: string]: string | number | undefined;`)
            )
        } else if (path.endsWith('SAS.js')) {
            _.replace((x) => x.replace('return "m.sas.v1";', 'return "m.sas.v1" as const;'))
        } else if (path.endsWith('crypto/store/base.ts')) {
            _.replace((x) => x + `\nexport interface CryptoStore {}`)
        } else if (path.endsWith('OlmDevice.js')) {
            _.replace(
                (x) =>
                    x +
                    `
/*
 * The type of object we use for importing and exporting megolm session data.
 */
export interface MegolmSessionData {
    /** Sender's Curve25519 device key */
    sender_key: string
    /** Devices which forwarded this session to us (normally empty). */
    forwarding_curve25519_key_chain: string[]
    /** Other keys the sender claims. */
    sender_claimed_keys: Record<string, string>
    /** Room this session is used in */
    room_id: string
    /** Unique id for the session */
    session_id: string
    /** Base64'ed key data */
    session_key: string
}`
            )
        } else {
            continue
        }
        log(`Run prefix for: ${path}`)
        _.apply()
    }
    console.log('Prefix done.')
}

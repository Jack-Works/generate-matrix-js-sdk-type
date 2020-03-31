import { Project, TypeGuards, ts } from 'ts-morph'
import { SourceFileReplacer } from './SourceFileReplacer'
import { log } from './log'

export function preFix(project: Project, matrixRoot: string) {
    for (const _ of project.getSourceFiles().map(x => new SourceFileReplacer(x))) {
        const path = _.sourceFile.getFilePath()
        log(`Run prefix for: ${path}`)

        if (path.endsWith('store/memory.js')) {
            _.replace(x =>
                x
                    .replace(/(.+): function\(/g, 'MemoryStore.prototype.$1 = function(')
                    .replace(/^    \},$/gm, '}')
                    .split('\n')
                    .slice(0, -2)
                    .join('\n')
                    .replace(`MemoryStore.prototype = \{`, '// ')
            )
        } else if (path.endsWith('http-api.js')) {
            _.replace(x =>
                x
                    .replace(
                        `export function MatrixError(errorJson) {`,
                        `
export class MatrixError extends Error {
    constructor(error) {
        super(errorJson.error)
`
                    )
                    .replace(
                        `MatrixError.prototype = Object.create(Error.prototype);
MatrixError.prototype.constructor = MatrixError;`,
                        '};'
                    )
            )
        } else if (path.endsWith('client.js')) {
            _.replace(x =>
                x
                    .replace(
                        /@param {module:client.callback} callback Optional./g,
                        `@param {module:client.callback} [callback] Optional.`
                    )
                    .replace(/@param {string\[\]} userIds/g, `@param {string[]} [userIds]`)
            )
        }

        _.replace(x =>
            x
                // {Object.<string, function(new: module:modulePath.ExportPath)>}
                // => {Record.<string, module:modulePath.ExportPath)>}
                .replace(/Object..string. function.new: module:(.+)\)./g, `Record<string, module:$1>`)
        )
        _.apply()
    }
    console.log('Prefix done.')
}

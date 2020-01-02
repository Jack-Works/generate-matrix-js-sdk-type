import { Project, TypeGuards, ts } from 'ts-morph'
import { SourceFileReplacer } from './SourceFileReplacer'
import { log } from './log'

export function preFix(project: Project, matrixRoot: string) {
    for (const _ of project.getSourceFiles().map(x => new SourceFileReplacer(x))) {
        const path = _.sourceFile.getFilePath()
        log(`Run prefix for: ${path}`)

        if (path.endsWith('store/memory.js')) {
            fixModuleExportsPrototype(_, 'MemoryStore')
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
                // A required parameter cannot follow an optional parameter.
                x.replace(/@param {Object} data The HTTP JSON body./g, `@param {Object} [data] The HTTP JSON body.`)
            )
            fixModuleExportsPrototype(_, 'MatrixHttpApi')
            _.touchSourceFile(x => {
                const MatrixError = x
                    .getStatements()
                    .filter(TypeGuards.isExpressionStatement)
                    .filter(x => x.getText().includes('MatrixError') && x.getText().startsWith('module.exports'))
                const f = MatrixError[0]
                    .getChildAtIndexIfKindOrThrow(1, ts.SyntaxKind.BinaryExpression)
                    .getChildAtIndexIfKindOrThrow(2, ts.SyntaxKind.FunctionExpression)

                const params = f
                    .getParameters()
                    .map(x => x.getText())
                    .join(', ')
                const body = f.getBody()
                MatrixError[2].remove()
                MatrixError[1].remove()
                MatrixError[0].replaceWithText(x =>
                    x.write(`module.exports.MatrixError = class MatrixError extends Error {
            constructor(${params}) {
                super()
                ${body.getText()}
            }
        }`)
                )
            })
        } else if (path.endsWith('crypto/olmlib.js')) {
            _.replace(x =>
                x
                    .replace(
                        //
                        `const _verifySignature = module.exports.verifySignature = async function`,
                        `module.exports.verifySignature = async function`
                    )
                    .replace(
                        //
                        `module.exports.pkSign =`,
                        `const _verifySignature = module.exports.verifySignature\nmodule.exports.pkSign =`
                    )
            )
        } else if (path.endsWith('utils.js')) {
            _.replace(x =>
                x.replace(
                    `const deepCompare = module.exports.deepCompare = function`,
                    `module.exports.deepCompare = function`
                )
            )
        } else if (path.endsWith('client.js')) {
            _.replace(x =>
                x
                    .replace('  * @typedef {Object} Promise', '  * @typedef {Object} PromiseDeprecated')
                    .replace(
                        /@param {module:client.callback} callback Optional./g,
                        `@param {module:client.callback} [callback] Optional.`
                    )
                    .replace(/@param {string\[\]} userIds/g, `@param {string[]} [userIds]`)
            )
        }

        // fix typos
        _.replace(x =>
            x
                .replace(/crypto-deviceinfo/g, 'crypto/deviceinfo')
                .replace(/module:event-timeline/g, 'module:models/event-timeline')
                .replace(/bolean/g, 'boolean')
                .replace(/sring/g, 'string')
                .replace(/module:client\.Promise/g, 'Promise')
                // {Object.<string, function(new: module:modulePath.ExportPath)>}
                // => {Record.<string, module:modulePath.ExportPath)>}
                .replace(/Object..string. function.new: module:(.+)\)./g, `Record<string, module:$1>`)
        )
        _.apply()
    }
    console.log('Prefix done.')
}
/**
 * Fix this pattern `module.exports.Name.prototype = {}`
 */
function fixModuleExportsPrototype(replacer: SourceFileReplacer, className: string) {
    log(
        `Fix module.exports.${className}.prototype= pattern which will crash tsc\n` +
            'see https://github.com/microsoft/TypeScript/issues/35228'
    )
    return replacer.replace(x =>
        x
            .replace(
                //
                `module.exports.${className} = function ${className}`,
                `function ${className}`
            )
            .replace(
                //
                `module.exports.${className}.prototype`,
                `module.exports.${className} = ${className};\n${className}.prototype`
            )
    )
}

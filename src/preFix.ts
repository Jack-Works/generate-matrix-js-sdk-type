import { Project, TypeGuards, ts } from 'ts-morph'
import { join } from 'path'
import { SourceFileReplacer } from './SourceFileReplacer'
import { log } from './log'

export function preFix(project: Project, matrixRoot: string) {
    project.addSourceFileAtPath(join(matrixRoot, 'crypto/store/base.js'))
    for (const _ of project
        .getSourceFiles()
        .map(x => new SourceFileReplacer(x))) {
        const path = _.sourceFile.getFilePath()
        log(`Run prefix for: ${path}`)

        if (path.endsWith('store/memory.js')) {
            fixModuleExportsPrototype(_, 'MemoryStore')
            _.replace(x =>
                x
                    .replace(
                        /(.+): function\(/g,
                        'MemoryStore.prototype.$1 = function('
                    )
                    .replace(/^    \},$/gm, '}')
                    .split('\n')
                    .slice(0, -2)
                    .join('\n')
                    .replace(`MemoryStore.prototype = \{`, '// ')
            )
        } else if (path.endsWith('http-api.js')) {
            fixModuleExportsPrototype(_, 'MatrixHttpApi')
            _.touchSourceFile(x => {
                const MatrixError = x
                    .getStatements()
                    .filter(TypeGuards.isExpressionStatement)
                    .filter(
                        x =>
                            x.getText().includes('MatrixError') &&
                            x.getText().startsWith('module.exports')
                    )
                const f = MatrixError[0]
                    .getChildAtIndexIfKindOrThrow(
                        1,
                        ts.SyntaxKind.BinaryExpression
                    )
                    .getChildAtIndexIfKindOrThrow(
                        2,
                        ts.SyntaxKind.FunctionExpression
                    )

                const params = f
                    .getParameters()
                    .map(x => x.getText())
                    .join(', ')
                const body = f.getBody()
                MatrixError[2].remove()
                MatrixError[1].remove()
                MatrixError[0].replaceWithText(x =>
                    x.write(`class MatrixError extends Error {
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
        }
        _.apply()
    }
    console.log('Prefix done.')
}
/**
 * Fix this pattern `module.exports.Name.prototype = {}`
 */
function fixModuleExportsPrototype(
    replacer: SourceFileReplacer,
    className: string
) {
    console.log(
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

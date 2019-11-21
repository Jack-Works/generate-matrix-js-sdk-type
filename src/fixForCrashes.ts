import { Project, TypeGuards, ts } from 'ts-morph'
import { join } from 'path'

export function fixForCrashes(project: Project, matrixRoot: string) {
    fixModuleExportsPrototype(project, join(matrixRoot, 'store/memory.js'), 'MemoryStore')
    fixModuleExportsPrototype(project, join(matrixRoot, 'http-api.js'), 'MatrixHttpApi')
    {
        try {
            const file = project.getSourceFileOrThrow(join(matrixRoot, 'http-api.js'))
            const MatrixError = file
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
                x.write(`class MatrixError extends Error {
            constructor(${params}) {
                super()
                ${body.getText()}
            }
        }`)
            )
            console.log('Fix MatrixError')
        } catch {}
    }
}

function fixModuleExportsPrototype(project: Project, fileName: string, className: string) {
    console.log(
        'Fix code that let TypeScript compiler crashes for class',
        className,
        'in',
        fileName,
        'see https://github.com/microsoft/TypeScript/issues/35228'
    )
    const file = project.getSourceFileOrThrow(fileName)
    let text = file.getText(true)
    text = text
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
    file.replaceWithText(text)
}

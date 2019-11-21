import { Project, ts, ImportDeclarationStructure, StructureKind } from 'ts-morph'

export function ESModuleFix(project: Project) {
    for (let sourceFile of project.getSourceFiles()) {
        const importedNames: string[] = []
        // collect all requires
        sourceFile = sourceFile.transform(traversal => {
            const node = traversal.visitChildren() // recommend always visiting the children first (post order)
            if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
                const importName = (node.arguments[0] as ts.Identifier).text
                importedNames.push(importName)
                return node
            }
            return node
        })
        sourceFile.addImportDeclarations(
            importedNames.map<ImportDeclarationStructure>((x, index) => ({
                namespaceImport: getGeneratedName(x, index),
                moduleSpecifier: x,
                kind: StructureKind.ImportDeclaration
            }))
        )
        sourceFile = sourceFile.transform(traversal => {
            const node = traversal.visitChildren() // recommend always visiting the children first (post order)
            if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
                const importName = (node.arguments[0] as ts.Identifier).text
                const index = importedNames.indexOf(importName)
                if (index === -1) {
                    debugger
                    return node
                }
                return ts.createIdentifier(getGeneratedName(importName, index))
            }
            return node
        })
        console.log('require in ESModule fixed', sourceFile.getFilePath())
        function getGeneratedName(x: string, index: number) {
            return `$_generated_${index}`
        }
    }
}

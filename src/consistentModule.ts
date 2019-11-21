import { Project } from 'ts-morph'

export function consistentModule(project: Project) {
    for (const sourceFile of project.getSourceFiles()) {
        for (const importDeclaration of sourceFile.getImportDeclarations()) {
            // import n
            const defaultImport = importDeclaration.getDefaultImport()
            // import { x } from
            const namedImports = importDeclaration.getNamedImports()
            // import * as n
            const nsImport = importDeclaration.getNamespaceImport()
            const moduleSpecifier = importDeclaration.getModuleSpecifierValue()
            if (defaultImport || nsImport)
                importDeclaration.replaceWithText(
                    `const ${(defaultImport || nsImport)!.getText()} = require("${moduleSpecifier}");`
                )
            else if (namedImports) {
                const namedImportsCJSStyle = namedImports
                    .map(x => [x.getName(), x.getAliasNode()?.getText()])
                    .map(([x, y]) => (y ? `${x}: ${y}` : x))
                importDeclaration.replaceWithText(`const {${namedImportsCJSStyle}} = require("${moduleSpecifier}");`)
            } else {
                importDeclaration.replaceWithText(`require("${moduleSpecifier}");`)
            }
        }
    }
}

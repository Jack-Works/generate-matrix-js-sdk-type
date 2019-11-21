import { Project, ts } from 'ts-morph'

export function ESModuleFix(project: Project) {
    for (let sourceFile of project.getSourceFiles()) {
        sourceFile = sourceFile.transform(traversal => {
            const node = traversal.visitChildren() // recommend always visiting the children first (post order)
            if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
                // require(_expr) => (await import(_expr))
                return ts.createParen(
                    ts.createAwait(
                        ts.createCall(
                            // @ts-ignore
                            ts.createToken(ts.SyntaxKind.ImportKeyword),
                            undefined,
                            node.arguments
                        )
                    )
                )
            }
            return node
        })
        console.log('require in ESModule fixed', sourceFile.getFilePath())
    }
}

import { Project } from 'ts-morph'

// This constructor function may be converted to a class declaration.
const DIAG_UPGRADE_TO_ES6 = 80002
export function es5ClassUpgrade(project: Project) {
    const languageService = project.getLanguageService()
    // Transform class from ES5 to ES6
    for (let sourceFile of project.getSourceFiles()) {
        const fileName = sourceFile.getFilePath()
        if (fileName.endsWith('.d.ts')) continue

        let diagnostics = getDiag(fileName)
        let invalidDiagnostic = 0
        while (diagnostics.length - invalidDiagnostic) {
            const diag = diagnostics[invalidDiagnostic]
            const fixes = languageService.getCodeFixesAtPosition(
                fileName,
                diag.getStart(),
                diag.getStart() + diag.getLength(),
                [diag.getCode()],
                {},
                {}
            )

            const changes = fixes[0]?.getChanges()[0]?.getTextChanges()
            if (!changes) {
                invalidDiagnostic += 1
                continue
            }
            const oldSource = sourceFile.getFullText()
            sourceFile.applyTextChanges(changes)
            const newSource = sourceFile.getFullText()
            if (oldSource === newSource) {
                invalidDiagnostic += 1
                continue
            }
            console.log('Class upgraded for ', fileName)
            let lastDig = diagnostics.length
            if (diagnostics.length - invalidDiagnostic >= lastDig) {
                invalidDiagnostic += 1
                continue
            }
            diagnostics = getDiag(fileName)
        }
    }

    function getDiag(fileName: string) {
        return languageService.getSuggestionDiagnostics(fileName).filter(x => x.getCode() === DIAG_UPGRADE_TO_ES6)
    }
}

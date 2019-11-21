import { Project, SourceFile } from 'ts-morph'

const DIAG_UPGRADE_MODULE_TO_ES6 = 80001
// This constructor function may be converted to a class declaration.
const DIAG_UPGRADE_CLASS_TO_ES6 = 80002
export function es5ClassUpgrade(project: Project) {
    const languageService = project.getLanguageService()
    // Transform class from ES5 to ES6
    for (let sourceFile of project.getSourceFiles()) {
        const fileName = sourceFile.getFilePath()
        if (fileName.endsWith('.d.ts')) continue

        let diagnostics = getDiag(fileName, sourceFile)
        let ignoreLastNDiagnostic = 0
        while (diagnostics.length - ignoreLastNDiagnostic > 0) {
            const _ = diagnostics.slice(0, diagnostics.length - ignoreLastNDiagnostic)
            const diag = _[_.length - 1]
            try {
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
                    ignoreLastNDiagnostic += 1
                    continue
                }
                const oldSource = sourceFile.getFullText()
                sourceFile = sourceFile.applyTextChanges(changes)
                const newSource = sourceFile.getFullText()
                if (oldSource === newSource) {
                    ignoreLastNDiagnostic += 1
                    continue
                }
                if (diag.getCode() === DIAG_UPGRADE_CLASS_TO_ES6) {
                    console.log('Class upgraded for ', fileName)
                } else if (diag.getCode() === DIAG_UPGRADE_MODULE_TO_ES6) {
                    console.log('Module system upgraded for ', fileName)
                }
                diagnostics = getDiag(fileName, sourceFile)
            } catch (e) {
                console.log(e)
                ignoreLastNDiagnostic += 1
            }
        }
    }

    function getDiag(fileName: string, sourceFile: SourceFile) {
        return languageService.getSuggestionDiagnostics(fileName).filter(x => {
            if (x.getCode() === DIAG_UPGRADE_MODULE_TO_ES6) {
                return true
                // if (sourceFile.getExportDeclarations().length) return true
                // return false
            }
            return x.getCode() === DIAG_UPGRADE_CLASS_TO_ES6
        })
    }
}

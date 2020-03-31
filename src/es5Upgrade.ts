import { Project, SourceFile } from 'ts-morph'
import { log } from './log'
import { SourceFileReplacer } from './SourceFileReplacer'

// This constructor function may be converted to a class declaration.
const DIAG_UPGRADE_CLASS_TO_ES6 = 80002
export function es5ClassUpgrade(project: Project) {
    const languageService = project.getLanguageService()
    // Transform class from ES5 to ES6
    for (let sourceFile of project.getSourceFiles()) {
        const fileName = sourceFile.getFilePath()
        if (fileName.endsWith('.d.ts')) continue
        if (!sourceFile.getText().includes('prototype')) {
            const has = ['pushprocessor', 'room', 'search-result'].some(x => fileName.includes(x))
            if (!has) continue
        }

        let diagnostics = getDiag(fileName, sourceFile)
        // some diagnostics fixes may have no effect even throw so we should prevent a dead loop
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
                    log('Class upgraded for ', fileName)
                }
                diagnostics = getDiag(fileName, sourceFile)
            } catch (e) {
                console.error(e)
                ignoreLastNDiagnostic += 1
            }
        }
        const r = new SourceFileReplacer(sourceFile)
        const path = sourceFile.getFilePath()
        if (path.endsWith('store/indexeddb-local-backend.js')) {
            r.replace(x =>
                x
                    .replace(/    async\n +\/\*\*/, '/**')
                    .replace(
                        ` setOutOfBandMembers(roomId, membershipEvents) {`,
                        'async setOutOfBandMembers(roomId, membershipEvents) {'
                    )
            )
        } else if (path.endsWith('store/memory.js')) {
            r.replace(x => x.slice(0, -15))
        }
        r.apply()
    }

    function getDiag(fileName: string, sourceFile: SourceFile) {
        return languageService.getSuggestionDiagnostics(fileName).filter(x => {
            return x.getCode() === DIAG_UPGRADE_CLASS_TO_ES6
        })
    }
}

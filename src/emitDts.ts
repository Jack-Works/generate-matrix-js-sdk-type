import ts from 'typescript/built/local/typescript'

export function emitDts(program: ts.Program) {
    const emitResult = program.emit(undefined, undefined, undefined, true, undefined)
    console.log(
        ts.formatDiagnostics(emitResult.diagnostics, {
            getNewLine: () => '\n',
            getCurrentDirectory: ts.sys.getCurrentDirectory,
            getCanonicalFileName: x => x
        })
    )
}

import ts from 'typescript/built/local/typescript'
import { join } from 'path'
import { es5ClassUpgrade } from './es5ClassUpgrade'
import { consistentModule } from './consistentModule'

const matrixRoot = join(__dirname, '../../matrix-js-sdk/src/')
const dtsRoot = join(__dirname, '../../matrix-js-sdk-type/dts')
const sourceRoot = 'node_modules/matrix-js-sdk/src'

const compilerOptions: ts.CompilerOptions = {
    allowJs: true,
    declaration: true,
    declarationDir: dtsRoot,
    sourceRoot: sourceRoot,
    declarationMap: true,
    composite: true,
    emitDeclarationOnly: true
}

import * as tsm from 'ts-morph'
import { Project } from 'ts-morph'
import { fixForCrashes } from './fixForCrashes'

const project = new Project({
    compilerOptions,
    manipulationSettings: { indentationText: tsm.IndentationText.FourSpaces }
})
console.log('Using TypeScript version:', tsm.ts.version)

project.addSourceFilesAtPaths(join(matrixRoot, '**/*.js'))

fixForCrashes(project, matrixRoot)
consistentModule(project)
es5ClassUpgrade(project)

project.save()
project.emit().then(x => {
    project.formatDiagnosticsWithColorAndContext(x.getDiagnostics())
    console.log('.d.ts emitted')
})

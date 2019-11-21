import { join } from 'path'
import { es5ClassUpgrade as es5Upgrade } from './es5Upgrade'
import { consistentModule } from './consistentModule'
import { CompilerOptions, IndentationText } from 'ts-morph'
import { Project } from 'ts-morph'
import { fixForCrashes } from './fixForCrashes'
import { version } from 'typescript/built/local/typescript'
// @ts-ignore
import rimraf from 'rimraf'
import { ESModuleFix } from './ESModuleFix'

const matrixRoot = join(__dirname, '../../matrix-js-sdk/src/')
const dtsRoot = join(__dirname, '../../matrix-js-sdk-type/dts')
const sourceRoot = 'node_modules/matrix-js-sdk/src'

const compilerOptions: CompilerOptions = {
    allowJs: true,
    declaration: true,
    declarationDir: dtsRoot,
    sourceRoot: sourceRoot,
    declarationMap: true,
    composite: true,
    emitDeclarationOnly: true
}

rimraf.sync(dtsRoot)
console.log('Old dts cleared')

const project = new Project({
    compilerOptions,
    manipulationSettings: { indentationText: IndentationText.FourSpaces }
})
console.log('Using TypeScript version:', version)

project.addSourceFilesAtPaths(join(matrixRoot, '**/*.js'))

fixForCrashes(project, matrixRoot)
// all es import to cjs
consistentModule(project)
// upgrade class and module system to ES6
es5Upgrade(project)
// all cjs to es import
ESModuleFix(project)

// project.save()
project.emit().then(x => {
    project.formatDiagnosticsWithColorAndContext(x.getDiagnostics())
    console.log('.d.ts emitted')
})

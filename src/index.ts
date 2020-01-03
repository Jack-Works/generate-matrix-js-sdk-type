import { join } from 'path'
import { es5ClassUpgrade as es5Upgrade } from './es5Upgrade'
import { consistentModule } from './consistentModule'
import { CompilerOptions, IndentationText, ScriptTarget, ModuleResolutionKind } from 'ts-morph'
import { Project } from 'ts-morph'
import { version } from 'typescript/built/local/typescript'
// @ts-ignore
import rimraf from 'rimraf'
import { ESModuleFix } from './ESModuleFix'
import { afterFixes } from './afterFixes'
import { JSDocTypeResolution } from './JSDocTypeResolution'
import { preFix } from './preFix'
import { dtsFixes } from './dtsFixes'

const matrixRoot = join(__dirname, '../../matrix-js-sdk/src/')
const dtsRoot = join(__dirname, '../../matrix-js-sdk-type/dts')
const sourceRoot = 'node_modules/matrix-js-sdk/src'

const compilerOptions: CompilerOptions = {
    allowJs: true,
    declaration: true,
    declarationDir: dtsRoot,
    sourceRoot: sourceRoot,
    composite: true,
    emitDeclarationOnly: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    target: ScriptTarget.ESNext,
    moduleResolution: ModuleResolutionKind.NodeJs
}

rimraf.sync(dtsRoot)
console.log('Old dts cleared')

const project = new Project({
    compilerOptions,
    manipulationSettings: { indentationText: IndentationText.FourSpaces }
})
console.log('Using TypeScript version:', version)

project.addSourceFilesAtPaths(join(matrixRoot, '**/*.js'))
project.addSourceFileAtPath(join(matrixRoot, 'crypto/store/base.js'))

preFix(project, matrixRoot)
// all es import to cjs
consistentModule(project)
// upgrade class and module system to ES6
es5Upgrade(project)
// all cjs to es import
ESModuleFix(project)
JSDocTypeResolution(project, matrixRoot)
afterFixes(project)

// project.save()

// const needEmit = false
// dtsFixes(dtsRoot)
const needEmit = true
needEmit &&
    (console.log('Emitting .d.ts files'), true) &&
    project.emit({ emitOnlyDtsFiles: true }).then(x => {
        project.formatDiagnosticsWithColorAndContext(x.getDiagnostics())
        if (x.getEmitSkipped()) {
            console.log('Warning! Emit skipped! You may want to attach a debugger to figure out why.')
        }
        console.log('.d.ts emitted')
        dtsFixes(dtsRoot)
    }, console.error)

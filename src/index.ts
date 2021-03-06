import { join } from 'path'
import { es5ClassUpgrade as es5Upgrade } from './es5Upgrade'
import { CompilerOptions, IndentationText, ScriptTarget, ModuleResolutionKind } from 'ts-morph'
import { Project } from 'ts-morph'
import { version } from 'typescript'
// @ts-ignore
import rimraf from 'rimraf'
import { afterFixes } from './afterFixes'
import { JSDocTypeResolution } from './JSDocTypeResolution'
import { preFix } from './preFix'
import { dtsFixes } from './dtsFixes'
import { readFileSync, writeFileSync } from 'fs'

const matrixRoot = join(__dirname, '../../matrix-js-sdk/src/')
const dtsRoot = join(__dirname, '../../matrix-js-sdk-type/src')
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
    strict: true,
    target: ScriptTarget.ESNext,
    moduleResolution: ModuleResolutionKind.NodeJs,
}

rimraf.sync(dtsRoot)
console.log('Old dts cleared')

const project = new Project({
    compilerOptions,
    manipulationSettings: { indentationText: IndentationText.FourSpaces },
})
console.log('Using TypeScript version:', version)

project.addSourceFilesAtPaths(join(matrixRoot, '**/*.js'))
project.addSourceFilesAtPaths(join(matrixRoot, '**/*.ts'))

preFix(project, matrixRoot)
// upgrade class to ES6
es5Upgrade(project)
JSDocTypeResolution(project, matrixRoot)
afterFixes(project)

// project.save()

// const needEmit = false
const needEmit = true
if (needEmit) {
    console.log('Emitting .d.ts files')

    project.emit({ emitOnlyDtsFiles: true }).then((x) => {
        project.formatDiagnosticsWithColorAndContext(x.getDiagnostics())
        if (x.getEmitSkipped()) {
            console.warn('Warning! Emit skipped! You may want to attach a debugger to figure out why.')
        }
        console.log('.d.ts emitted')
        dtsFixes(dtsRoot)
        const global = readFileSync(join(matrixRoot, '@types/global.d.ts'), 'utf-8').replace(
            'import * as Olm from "olm";',
            ''
        )
        writeFileSync(join(dtsRoot, '@types/global.d.ts'), global)
    }, console.error)
}

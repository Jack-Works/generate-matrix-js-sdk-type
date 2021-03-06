import {
    Project,
    ImportDeclarationStructure,
    StructureKind,
    ImportSpecifierStructure,
    Symbol,
    ts,
    Node,
} from 'ts-morph'
import jsdoc from 'doctrine'
import { join } from 'path'
import { SourceFileReplacer } from './SourceFileReplacer'

/**
 * JSDoc Type Resolution:
 *
 * JSDoc Type => TypeScript Type
 *
 * First step, scan all files, keep the JSDoc module declaration.
 * Second step, run a transform on all files to transform JSDoc type to TS type.
 */
export function JSDocTypeResolution(project: Project, matrixRoot: string) {
    const [moduleMap, exports] = resolveJSDocModules(project)
    function appendModuleAtPath(moduleName: string, filePath = moduleName + '.js') {
        moduleMap.set(moduleName, project.getSourceFileOrThrow(join(matrixRoot, filePath)).getFilePath())
    }
    appendModuleAtPath('crypto/store/base', 'crypto/store/base.ts')
    appendModuleAtPath('crypto/OlmDevice')
    appendModuleAtPath('crypto/algorithms/base', 'crypto/algorithms/base.ts')
    appendModuleAtPath('crypto/verification/Base')
    appendModuleAtPath('http-api')
    appendModuleAtPath('models/event', 'models/event.ts')
    appendModuleAtPath('crypto/verification/request/VerificationRequest')

    const symbolCache = new Map<string, readonly [Symbol[], Symbol | undefined]>()
    function getExportsOfPath(target: string) {
        if (symbolCache.has(target)) return symbolCache.get(target)!
        const targetSourceFile = project.getSourceFileOrThrow(target)
        const exports = targetSourceFile.getExportSymbols()
        const defaultExport = targetSourceFile.getDefaultExportSymbol()
        const result = [exports, defaultExport] as const
        symbolCache.set(target, result)
        return result
    }
    for (const _ of project.getSourceFiles().map((x) => new SourceFileReplacer(x))) {
        const fileName = _.sourceFile.getFilePath()
        if (fileName.endsWith('.ts')) continue
        const jsdocReplaceContext: JSDocReplaceContext = {
            appendESImports: new Map(),
            moduleMap: moduleMap,
            project: project,
            matrixRoot: matrixRoot,
            sourceFile: fileName,
            exportsMap: exports,
        }
        _.touchSourceFile(function access(_: Node<ts.Node>) {
            const replaceMap = new Map<string, string>()
            _.getLeadingCommentRanges().forEach((x) => {
                const comment = x.getText()
                if (comment.startsWith('// ')) return
                const next = transformJSDocComment(comment, jsdocReplaceContext)?.nextComment
                if (next) replaceMap.set(comment, '/**\n  * ' + next.replace(/\n/g, '\n  * ') + '\n  */ ')
            })
            if (replaceMap.size) {
                let source = _.getText(true)
                for (const [orig, next] of replaceMap) {
                    source = source.replace(orig, next)
                }
                _.replaceWithText(source)
            }
            try {
                _.getChildren().forEach(access)
            } catch (e) {
                if (e.message.includes('Debug Failure.')) {
                } else throw e
            }
        })
        let sourceText = _.sourceFile.getText()
        try {
            _.touchSourceFile(
                (sourceFile) =>
                    void sourceFile.addImportDeclarations(
                        Array.from(jsdocReplaceContext.appendESImports)
                            .map<ImportDeclarationStructure>(([path, bindingNames]) => {
                                const target = moduleMap.get(path)!
                                const [exports, defaultExport] = getExportsOfPath(target)
                                let defaultImport: undefined | string = undefined
                                const namedImports: ImportSpecifierStructure[] = []
                                for (const binding of bindingNames) {
                                    if (sourceFile.getLocal(binding)?.getDeclarations().length ?? 0 > 0) continue
                                    if (!binding) {
                                        console.warn(`Invalid binding name at "${target}"`)
                                        continue
                                    }
                                    resolveBindingName: {
                                        for (const remoteSymbol of exports) {
                                            const name = remoteSymbol.getName()
                                            if (name === binding) {
                                                namedImports.push({
                                                    name: binding,
                                                    kind: StructureKind.ImportSpecifier,
                                                })
                                                break resolveBindingName
                                            } else if (name === 'I' + binding) {
                                                // Type => IType
                                                namedImports.push({
                                                    name: name,
                                                    alias: binding,
                                                    kind: StructureKind.ImportSpecifier,
                                                })
                                                break resolveBindingName
                                            }
                                        }
                                        const warn = () =>
                                            console.warn(
                                                `Unresolved import "${binding}" from "${target}" at file ${sourceFile.getFilePath()}`
                                            )
                                        if (defaultExport) {
                                            const bindingName = getDefaultExportDeclaration(defaultExport)
                                            if (bindingName) defaultImport = binding
                                            else warn()
                                        } else warn()
                                    }
                                }
                                if (target === sourceFile.getFilePath()) return null!
                                return {
                                    moduleSpecifier: target,
                                    kind: StructureKind.ImportDeclaration,
                                    defaultImport: defaultImport,
                                    namedImports: namedImports,
                                }
                            })
                            .filter(Boolean)
                    )
            )
            _.apply()
            // this file is touched so the cache is invalid now.
            symbolCache.delete(_.sourceFile.getFilePath())
        } catch (e) {
            console.debug(sourceText)
            throw e
        }
    }
}

function resolveJSDocModules(project: Project) {
    type JSDocModule = string
    type TypeScriptSourceFile = string
    type ExportBindingName = string
    const map = new Map<JSDocModule, TypeScriptSourceFile>()
    const exports = new Map<JSDocModule, ExportBindingName[]>()

    for (const sourceFile of project.getSourceFiles()) {
        for (const nodeWithComment of sourceFile.getStatementsWithComments()) {
            for (const each of nodeWithComment.getLeadingCommentRanges()) {
                const parsed = jsdoc.parse(each.getText(), {
                    unwrap: true,
                    tags: ['module'],
                })
                for (const tag of parsed.tags) {
                    if (!tag.name) break
                    map.set(tag.name, sourceFile.getFilePath())
                    const decl = sourceFile.getExportedDeclarations()
                    exports.set(tag.name, [...decl.keys()])
                }
            }
        }
    }
    return [map, exports] as const
}

function transformJSDocComment(comment: string, replaceContext: JSDocReplaceContext): { nextComment: string } | null {
    const parsed = jsdoc.parse(comment, {
        recoverable: true,
        sloppy: true,
        unwrap: true,
    })
    if (parsed.tags.length === 0) return null

    const usedRecordInParam = new Set<string>()
    let previouslyOptional = false
    let parsedTags = parsed.tags
        .map((x) => {
            if (x.title !== 'param') return x
            if (x.description?.includes('A list of state events. This i')) debugger
            convertToOptionalName(x)
            return x
        })
        // .map<jsdoc.Tag>((tag) => ({ ...tag, type: outerPatch(map(replaceContext)(tag.type)) }))
        .map<jsdoc.Tag>((tag) => ({ ...tag, type: map(replaceContext)(tag.type) }))
    // ? collect all props
    for (const tag of parsedTags) {
        if (!tag.name?.includes('.')) continue
        const [obj] = tag.name.split('.')
        usedRecordInParam.add(obj)
    }

    for (const each of usedRecordInParam) {
        if (parsedTags.find((x) => x.name === each)) continue
        const usageIndex = parsedTags.findIndex((x) => x.name?.startsWith(each))
        const usage = parsedTags[usageIndex]
        if (usage?.title === 'alias') continue
        parsedTags.splice(usageIndex, 0, {
            description: '__auto_generated__',
            title: usage?.title || 'param',
            kind: usage?.kind,
            name: each,
            type: jsdoc.parseType('Object'),
        })
    }
    const targetTag =
        parsed.description +
        '\n' +
        parsedTags
            .map((x) => {
                const type = x.type && jsdoc.type.stringify(x.type)
                const title = x.title
                const typeExpr = type ? '{' + type + '}' : ''
                const name = x.name
                const desc = x.description ?? ''
                return '@' + [title, typeExpr, name, desc].filter((x) => x).join(' ')
            })
            .join('\n')
    function convertToOptionalName(x: jsdoc.Tag) {
        if (!x.name) return
        const alreadyOpt = x.type?.type === jsdoc.type.Syntax.OptionalType
        // It's a sub attribute like "opts.opt"
        if (x.name.includes('.')) return
        if (alreadyOpt) {
            previouslyOptional = true
            return
        } else if (previouslyOptional && x.type) {
            x.type = { type: 'OptionalType', expression: x.type } as jsdoc.type.OptionalType
            return
        }
    }
    return {
        nextComment: targetTag,
    }
}

interface JSDocReplaceContext {
    /**
     * Map<Path, Set<ImportBindingName>>
     */
    appendESImports: Map<string, Set<string>>
    /**
     * JSDocResolveMap<JSDocModule, Path>
     */
    moduleMap: ReadonlyMap<string, string>
    exportsMap: ReadonlyMap<string, string[]>
    project: Project
    matrixRoot: string
    sourceFile: string
}
function JSDocTagReplace(type: jsdoc.Type, ctx: JSDocReplaceContext): [jsdoc.Type, JSDocReplaceContext] {
    let nextType = clone(type)
    if (!nextType?.type) return [type, ctx]
    switch (nextType.type) {
        case jsdoc.Syntax.NonNullableType:
        case jsdoc.Syntax.ParameterType:
            console.warn(`Unhandled JSDoc Type ${nextType.type}`)
            return [type, ctx]
        // Bypass type.
        case jsdoc.Syntax.NullLiteral: // null
        case jsdoc.Syntax.UndefinedLiteral: // undefined
        case jsdoc.Syntax.VoidLiteral: // void
        case jsdoc.Syntax.AllLiteral: // *, means any.
        case jsdoc.Syntax.NullableLiteral: // ?
            return [type, ctx]
        // High level type.
        // ..TypeExpression, used in @param {...restParamType}
        case jsdoc.Syntax.RestType: {
            console.warn('A RestType is used. TypeScript compiler cannot recognize this pattern.')
            return [
                {
                    ...nextType,
                    expression: map(ctx)(nextType.expression),
                } as jsdoc.type.RestType,
                ctx,
            ]
        }
        // [A, B, C]
        case jsdoc.Syntax.ArrayType:
        // A | B | C
        case jsdoc.Syntax.UnionType: {
            return [
                {
                    ...nextType,
                    elements: nextType.elements.map(map(ctx)),
                } as jsdoc.type.UnionType | jsdoc.type.ArrayType,
                ctx,
            ]
        }
        case jsdoc.Syntax.FieldType: {
            return [
                {
                    ...nextType,
                    value: map(ctx)(nextType.value),
                } as jsdoc.type.FieldType,
                ctx,
            ]
        }
        // { a, b } object literal type
        case jsdoc.Syntax.RecordType: {
            return [
                {
                    ...nextType,
                    fields: nextType.fields.map((x) => JSDocTagReplace(x, ctx)[0]),
                } as jsdoc.type.RecordType,
                ctx,
            ]
        }
        // Type<applications>
        case jsdoc.Syntax.TypeApplication: {
            // if (nextType.applications.length === 0 && nextType.expression.type === jsdoc.type.Syntax.NameExpression && nextType.expression.name === 'Array') {
            //     return [ArrayOfAnyNode, ctx]
            // }
            // if (nextType.applications.length === 0 && nextType.expression.type === jsdoc.type.Syntax.NameExpression && nextType.expression.name === 'Promise') {
            //     return [PromiseOfAnyNode, ctx]
            // }
            return [
                {
                    ...nextType,
                    applications: nextType.applications.map((y) => JSDocTagReplace(y, ctx)[0]),
                    expression: JSDocTagReplace(nextType.expression, ctx)[0],
                } as jsdoc.type.TypeApplication,
                ctx,
            ]
        }
        // ?Nullable
        case jsdoc.Syntax.NullableType:
        // Optional=
        case jsdoc.Syntax.OptionalType: {
            nextType.type = nextType.type
            nextType.expression = map(ctx)(nextType.expression)
            return [nextType, ctx]
        }
        // Special handled type.
        case jsdoc.Syntax.NameExpression: {
            const n = nextType.name
            if (n === 'class') nextType.name = '{ new(...args: any[]): any }'
            else if (['int', 'float', 'integer'].includes(n)) nextType.name = 'number'
            else if (['bool'].includes(n)) nextType.name = 'boolean'
            else if (n === 'Object') nextType.name = 'object'
            else if (n === 'event') nextType.name = 'any'
            else if (n.startsWith('module:')) {
                const [moduleName, ...importBindings] = n.replace('module:', '').replace(/~/g, '.').split('.')
                if (importBindings.length > 1)
                    console.warn(`Unexpected dot in exportBinding "${importBindings.join('.')}" in ${ctx.sourceFile}`)
                else if (importBindings.length === 0) {
                    const path = ctx.moduleMap.get(moduleName)
                    if (path) {
                        const sourceFile = ctx.project.getSourceFileOrThrow(path)
                        const defExp = sourceFile.getDefaultExportSymbol()

                        if (defExp) {
                            const bindingName = getDefaultExportDeclaration(defExp)
                            if (bindingName) importBindings.push(bindingName)
                        }
                    }
                }
                if (!ctx.moduleMap.has(moduleName)) console.warn(`Unresolved module "${moduleName}"`)
                else {
                    const imports = ctx.appendESImports.get(moduleName) || new Set()
                    imports.add(importBindings.join('.'))
                    ctx.appendESImports.set(moduleName, imports)
                }
                nextType.name = importBindings.join('.')
            }
            for (const [jsdocModuleName, bindings] of ctx.exportsMap) {
                if (bindings.includes(n)) wellKnownImport(jsdocModuleName, n)
            }
            return [nextType, ctx]
            function wellKnownImport(path: string, name: string) {
                const imports = ctx.appendESImports.get(path) || new Set()
                imports.add(name)
                ctx.appendESImports.set(path, imports)
            }
        }
        case jsdoc.Syntax.FunctionType: {
            // TODO: Transform to TypeScript type
            return [type, ctx]
        }
        default: {
            console.error('Unhandled type')
            return [type, ctx]
        }
    }
}

function clone<T>(x: T): T {
    return JSON.parse(JSON.stringify(x))
}
function map(ctx: JSDocReplaceContext) {
    return <T extends jsdoc.Type | undefined | null>(x: T) => (x ? (JSDocTagReplace(x!, ctx)[0] as T) : (x as T))
}
// const PromiseOfAnyNode = of({
//     type: jsdoc.type.Syntax.TypeApplication,
//     expression: of({
//         type: jsdoc.type.Syntax.NameExpression,
//         name: 'Promise',
//     }),
//     applications: [of({ type: jsdoc.type.Syntax.AllLiteral })]
// })
// const ArrayOfAnyNode = of({
//     type: jsdoc.type.Syntax.TypeApplication,
//     expression: of({
//         type: jsdoc.type.Syntax.NameExpression,
//         name: 'Array',
//     }),
//     applications: [of({ type: jsdoc.type.Syntax.AllLiteral })]
// })
// function outerPatch<T extends jsdoc.Type | undefined | null>(x: T) {
//     if (!x) return x
//     const string = jsdoc.type.stringify(x!)
// if (string === 'Promise') return PromiseOfAnyNode
// if (string === 'Array') return ArrayOfAnyNode
//     return x
// }
function of<T extends jsdoc.Type>(x: T) {
    return x
}
function getDefaultExportDeclaration(x: Symbol): string | undefined {
    const zeroDecl = x?.getDeclarations()?.[0]
    const bindingName =
        zeroDecl
            // @ts-ignore
            ?.getExpression?.()
            ?.getText() ??
        zeroDecl
            // @ts-ignore
            ?.getName()
    return bindingName
}

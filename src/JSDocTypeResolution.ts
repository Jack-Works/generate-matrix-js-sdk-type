import { Project, ImportDeclarationStructure, StructureKind, ImportSpecifierStructure, Symbol } from 'ts-morph'
import jsdoc from 'doctrine'
import { join } from 'path'
import { log } from './log'
import { SourceFileReplacer } from './SourceFileReplacer'

import * as babelParse from '@babel/parser'
import babelTraverse from '@babel/traverse'
import * as babelTypes from '@babel/types'
import * as babelGenerator from '@babel/generator'

/**
 * JSDoc Type Resolution:
 *
 * JSDoc Type => TypeScript Type
 *
 * First step, scan all files, keep the JSDoc module declaration.
 * Second step, run a transform on all files to transform JSDoc type to TS type.
 */
export function JSDocTypeResolution(project: Project, matrixRoot: string) {
    const moduleMap = resolveJSDocModules(project)
    function appendModuleAtPath(moduleName: string, filePath = moduleName + '.js') {
        moduleMap.set(moduleName, project.getSourceFileOrThrow(join(matrixRoot, filePath)).getFilePath())
    }
    appendModuleAtPath('crypto/store/base')
    appendModuleAtPath('crypto/OlmDevice')
    appendModuleAtPath('crypto/algorithms/base')
    appendModuleAtPath('crypto/verification/Base')
    appendModuleAtPath('http-api')
    appendModuleAtPath('base-apis')
    appendModuleAtPath('models/event')

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

    for (const _ of project.getSourceFiles().map(x => new SourceFileReplacer(x))) {
        const newLocal = _.sourceFile.getFilePath()
        log('Resolving JSDoc linking for', newLocal)
        const changeContext: JSDocReplaceContext = {
            appendESImports: new Map(),
            moduleMap: moduleMap,
            project: project,
            matrixRoot: matrixRoot
        }
        let sourceText = _.sourceFile.getText()
        try {
            const ast = babelParse.parse(sourceText, {
                sourceType: 'module',
                plugins: ['classProperties']
            })
            babelTraverse(ast, {
                enter(path) {
                    const comments = path.node.leadingComments
                    if (!comments) return
                    babelTypes.removeComments(path.node)
                    babelTypes.addComments(
                        path.node,
                        'leading',
                        comments
                            .map(x => {
                                if (x.type === 'CommentLine') return x
                                const next = transformJSDocComment(x.value, changeContext)?.nextComment
                                if (!next) return undefined as any
                                return {
                                    type: 'CommentBlock',
                                    value: '*\n * ' + next.replace(/\n/g, '\n * ') + '\n '
                                } as typeof x
                            })
                            .filter(x => x)
                    )
                }
            })
            const result = babelGenerator.default(ast, { comments: true }).code
            _.replace(() => result)

            _.touchSourceFile(
                sourceFile =>
                    void sourceFile.addImportDeclarations(
                        Array.from(changeContext.appendESImports)
                            .map<ImportDeclarationStructure>(([path, bindingNames]) => {
                                const target = moduleMap.get(path)!
                                const [exports, defaultExport] = getExportsOfPath(target)
                                let defaultImport: undefined | string = undefined
                                const namedImports: ImportSpecifierStructure[] = []
                                for (const binding of bindingNames) {
                                    if (sourceFile.getLocal(binding)?.getDeclarations().length ?? 0 > 0) continue
                                    if (!binding) {
                                        console.warn('Invalid binding name at', target)
                                        continue
                                    }
                                    const relatedSymbol = exports.find(x => x.getName() === binding)
                                    if (relatedSymbol) {
                                        namedImports.push({
                                            name: binding,
                                            kind: StructureKind.ImportSpecifier
                                        })
                                    } else {
                                        if (defaultExport) {
                                            const bindingName = getDefaultExportDeclaration(defaultExport)
                                            if (bindingName) defaultImport = binding
                                            else console.warn('Unresolved import ', binding)
                                        } else console.warn('Unresolved import ', binding)
                                    }
                                }
                                if (target === sourceFile.getFilePath()) return null!
                                return {
                                    moduleSpecifier: target,
                                    kind: StructureKind.ImportDeclaration,
                                    defaultImport: defaultImport,
                                    namedImports: namedImports
                                }
                            })
                            .filter(x => x)
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
    const map = new Map<JSDocModule, TypeScriptSourceFile>()

    for (const sourceFile of project.getSourceFiles()) {
        for (const nodeWithComment of sourceFile.getStatementsWithComments()) {
            for (const each of nodeWithComment.getLeadingCommentRanges()) {
                const parsed = jsdoc.parse(each.getText(), {
                    unwrap: true,
                    tags: ['module']
                })
                for (const tag of parsed.tags) {
                    if (!tag.name) break
                    map.set(tag.name, sourceFile.getFilePath())
                }
            }
        }
    }
    return map
}

function transformJSDocComment(comment: string, replaceContext: JSDocReplaceContext): { nextComment: string } | null {
    const parsed = jsdoc.parse(comment, {
        recoverable: true,
        sloppy: true,
        unwrap: true
    })
    if (parsed.tags.length === 0) return null

    const usedRecordInParam = new Set<string>()
    let parsedTags = parsed.tags.map<jsdoc.Tag>(tag => ({ ...tag, type: map(replaceContext)(tag.type) }))
    // ? collect all props
    for (const tag of parsedTags) {
        if (!tag.name?.includes('.')) continue
        const [obj] = tag.name.split('.')
        usedRecordInParam.add(obj)
    }

    for (const each of usedRecordInParam) {
        if (parsedTags.find(x => x.name === each)) continue
        const usageIndex = parsedTags.findIndex(x => x.name?.startsWith(each))
        const usage = parsedTags[usageIndex]
        if (usage?.title === 'alias') continue
        parsedTags.splice(usageIndex, 0, {
            description: '__auto_generated__',
            title: usage?.title || 'param',
            kind: usage?.kind,
            name: each,
            type: jsdoc.parseType('Object')
        })
    }

    const targetTag =
        parsed.description +
        '\n' +
        parsedTags
            .map(x => {
                const type = x.type && jsdoc.type.stringify(x.type)
                return `@${x.title} ${type ? '{' + type + '}' : ''} ${x.name ?? ''} ${x.description ?? ''}`
            })
            .join('\n')
    return {
        nextComment: targetTag
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
    project: Project
    matrixRoot: string
}
function JSDocTagReplace(type: jsdoc.Type, ctx: JSDocReplaceContext): [jsdoc.Type, JSDocReplaceContext] {
    let nextType = clone(type)
    if (!nextType?.type) return [type, ctx]
    switch (nextType.type) {
        case jsdoc.Syntax.NonNullableType:
        case jsdoc.Syntax.NullableLiteral:
        case jsdoc.Syntax.ParameterType:
            debugger
            console.warn(`Unhandled JSDoc Type ${nextType.type}`)
            return [type, ctx]
        // Bypass type.
        case jsdoc.Syntax.NullLiteral: // null
        case jsdoc.Syntax.UndefinedLiteral: // undefined
        case jsdoc.Syntax.VoidLiteral: // void
        case jsdoc.Syntax.AllLiteral: // *, means any.
            return [type, ctx]
        // High level type.
        // ..TypeExpression, used in @param {...restParamType}
        case jsdoc.Syntax.RestType: {
            console.warn('A RestType is used. TypeScript compiler cannot recognize this pattern.')
            return [
                {
                    ...nextType,
                    expression: map(ctx)(nextType.expression)
                } as jsdoc.type.RestType,
                ctx
            ]
        }
        // [A, B, C]
        case jsdoc.Syntax.ArrayType:
        // A | B | C
        case jsdoc.Syntax.UnionType: {
            return [
                {
                    ...nextType,
                    elements: nextType.elements.map(map(ctx))
                } as jsdoc.type.UnionType | jsdoc.type.ArrayType,
                ctx
            ]
        }
        case jsdoc.Syntax.FieldType: {
            return [
                {
                    ...nextType,
                    value: map(ctx)(nextType.value)
                } as jsdoc.type.FieldType,
                ctx
            ]
        }
        // { a, b } object literal type
        case jsdoc.Syntax.RecordType: {
            return [
                {
                    ...nextType,
                    fields: nextType.fields.map(x => JSDocTagReplace(x, ctx)[0])
                } as jsdoc.type.RecordType,
                ctx
            ]
        }
        // Type<applications>
        case jsdoc.Syntax.TypeApplication: {
            return [
                {
                    ...nextType,
                    applications: nextType.applications.map(y => JSDocTagReplace(y, ctx)[0]),
                    expression: JSDocTagReplace(nextType.expression, ctx)[0]
                } as jsdoc.type.TypeApplication,
                ctx
            ]
        }
        // ?Nullable
        case jsdoc.Syntax.NullableType:
        // Optional=
        case jsdoc.Syntax.OptionalType: {
            const falsy: jsdoc.type.UndefinedLiteral | jsdoc.type.NullLiteral = {
                type:
                    nextType.type === jsdoc.type.Syntax.OptionalType
                        ? jsdoc.Syntax.UndefinedLiteral
                        : jsdoc.Syntax.NullLiteral
            }
            nextType.type === 'OptionalType'
            nextType = {
                type: jsdoc.Syntax.UnionType,
                elements: [map(ctx)(nextType.expression), falsy]
            } as jsdoc.type.UnionType
            return [nextType, ctx]
        }
        // Special handled type.
        case jsdoc.Syntax.NameExpression: {
            const n = nextType.name
            if (n === 'Function' || n === 'function') nextType.name = '((...args: any) => any)'
            else if (n === 'class') nextType.name = 'any'
            else if (['int', 'float', 'Number', 'integer'].includes(n)) nextType.name = 'number'
            else if (['bool', 'Boolean'].includes(n)) nextType.name = 'boolean'
            else if (n === 'Object') nextType.name = 'object'
            else if (n === 'String') nextType.name = 'string'
            else if (n === 'array') nextType.name = 'Array'
            else if (n === 'Promise' || n === 'promise') nextType.name = 'Promise'
            else if (n.startsWith('module:')) {
                const [moduleName, ...importBindings] = n
                    .replace('module:', '')
                    .replace(/~/g, '.')
                    .split('.')
                if (importBindings.length > 1) console.warn('Unexpected dot in exportBinding', importBindings.join('.'))
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
                if (!ctx.moduleMap.has(moduleName)) console.warn('Unresolved module', moduleName)
                else {
                    const imports = ctx.appendESImports.get(moduleName) || new Set()
                    imports.add(importBindings.join('.'))
                    ctx.appendESImports.set(moduleName, imports)
                }
                nextType.name = importBindings.join('.')
            }
            return [nextType, ctx]
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

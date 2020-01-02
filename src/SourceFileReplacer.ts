import { SourceFile } from 'ts-morph'
export class SourceFileReplacer {
    constructor(public sourceFile: SourceFile) {}
    get currentSource() {
        return this.source
    }
    private source = this.sourceFile.getFullText()
    /**
     * Use this function to modify the sourceFile
     */
    touchSourceFile(x: (sf: SourceFile) => void | SourceFile) {
        this.apply()
        this.sourceFile = x(this.sourceFile) || this.sourceFile
        this.source = this.sourceFile.getFullText()
    }
    /**
     * Do replace the SourceFile
     */
    apply() {
        if (this.sourceFile.getFullText() === this.source) return this.sourceFile
        return (this.sourceFile = this.sourceFile.replaceWithText(this.source) as SourceFile)
    }
    debugApply() {
        this.apply()
        this.sourceFile.saveSync()
        process.exit(0)
    }
    /**
     * Schedule a full replace
     */
    replace(f: (x: string) => string) {
        this.source = f(this.source)
    }
    applyTextChange(start: number, length: number, replaceWith: string) {
        this.source = this.source.substring(0, start) + replaceWith + this.source.substring(start + length)
    }
    applyTextChanges(args: readonly Parameters<SourceFileReplacer['applyTextChange']>[]) {
        // start at higher place should replace at start
        const x = [...args].reverse().sort((x, y) => y[0] - x[0])
        for (const y of x) {
            this.applyTextChange(...y)
        }
    }
}

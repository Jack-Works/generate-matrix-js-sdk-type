import { clearLine, cursorTo } from 'readline'

let lastCalled = false
export function log(...args: string[]) {
    lastCalled = true
    clearLine(process.stdout, 0)
    cursorTo(process.stdout, 0, undefined)
    process.stdout.write(args.join(' '))
}

const proxy: ProxyHandler<{
    (message?: any, ...optionalParams: any[]): void
    (message?: any, ...optionalParams: any[]): void
}> = {
    apply(target, thisArg, args) {
        if (lastCalled === true) target()
        lastCalled = false
        target(...args)
    }
}

console.log = new Proxy(console.log, proxy)
console.warn = new Proxy(console.warn, proxy)
console.error = new Proxy(console.error, proxy)

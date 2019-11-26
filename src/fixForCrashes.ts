import { Project } from 'ts-morph'
export function tryReplace(
    project: Project,
    path: string,
    replacer: (x: string) => string
) {
    try {
        const file = project.getSourceFileOrThrow(path)
        let text = file.getText(true)
        text = replacer(text)
        file.replaceWithText(x => x.write(text))
    } catch {}
}

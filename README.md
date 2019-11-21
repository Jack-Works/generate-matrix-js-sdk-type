# Generate-matrix-js-sdk-type

This package is used to generate this repo https://github.com/Jack-Works/matrix-js-sdk-type/

The TypeScript compiler must be the compiled version from https://github.com/microsoft/TypeScript/pull/35219

And you must change the `package.json` in the TypeScript compiler.

```diff
-    "main": "./lib/typescript.js",
+    "main": "./built/local/typescript.js",
```

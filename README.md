- Maybe you need @types/matrix-js-sdk (https://github.com/matrix-org/matrix-js-sdk/issues/983#issuecomment-593534506)

# Generate-matrix-js-sdk-type

Current hash of matrix-js-sdk: fe2bdd027ed65232545115a6a1d445ea6838df4e

This package is used to generate this repo https://github.com/Jack-Works/matrix-js-sdk-type/

The TypeScript compiler must be the compiled version from https://github.com/microsoft/TypeScript/pull/35219

And you must change the `package.json` in the TypeScript compiler.

```diff
-    "main": "./lib/typescript.js",
+    "main": "./built/local/typescript.js",
```

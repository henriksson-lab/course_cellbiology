#!/bin/bash
# Build interactive demos: demos/src/<name>/main.ts -> demos/dist/<name>.js (IIFE,
# so it also works from file://). With no arguments, builds every demo.
# Images are inlined as data URLs: canvas pixels of a file:// image are unreadable.
# demos/src/lib/ is shared code, imported by the demos, not a demo itself.
set -e
cd "$(dirname "$0")/.."
mkdir -p demos/dist
cp demos/demo.css demos/dist/demo.css
names=("$@")
# Folders with a DRAFT file are unfinished and skipped in the default build.
[ ${#names[@]} -eq 0 ] && names=($(for d in demos/src/*/; do d=${d%/}; n=${d##*/}; [ "$n" = lib ] || [ -e "$d/DRAFT" ] || echo "$n"; done))
for n in "${names[@]}"; do
  node_modules/.bin/esbuild "demos/src/$n/main.ts" --bundle --format=iife --target=es2020 \
    --minify --log-level=warning --outfile="demos/dist/$n.js" \
    --loader:.jpg=dataurl --loader:.png=dataurl
done
echo "built: ${names[*]}"

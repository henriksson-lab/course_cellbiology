.PHONY: all render preview clean gitadd help edit-slides

# Default: render the site, then stage every source file in git.
all: render gitadd

render:
	quarto render
	@touch docs/.nojekyll

preview:
	quarto preview

# Edit slide text and SVG labels in the browser (tools/slide-editor/).
# Prints a URL with an access token; PORT=... and SLIDE_EDIT_TOKEN=... override.
PORT ?= 8737
edit-slides:
	node tools/slide-editor/server.mjs --port $(PORT)

# Remove the rendered site and Quarto's cache.
clean:
	rm -rf docs .quarto

# Stage every source file AND the built HTML (docs/) so the committed site is
# always current. The .quarto/ cache is never added (it is .gitignored).
gitadd:
	git add -- .

help:
	@echo "Targets:"
	@echo "  make           render the site, then git add all source files"
	@echo "  make render    render the whole site to docs/"
	@echo "  make preview   start a live-reload preview server"
	@echo "  make edit-slides  edit slide text and figure labels in the browser (port 8737)"
	@echo "  make gitadd    stage all source files in git"
	@echo "  make clean     remove docs/ and .quarto/"

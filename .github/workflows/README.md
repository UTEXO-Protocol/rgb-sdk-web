# Workflows

## ci.yml

Runs on push/PR to `dev`, `stage`, `main`. Checks: lint, typecheck, build. Replaces local `file:` dependencies with npm registry versions before running.

## release.yml

Manual trigger. Replaces local deps with npm versions, builds the package, publishes to npm as `@utexo/rgb-sdk-web`, and creates a GitHub Release. Input: version (e.g. `1.0.0`). Use from `main` branch for production releases.

## release-dev.yml

Manual trigger. Same build process but publishes with a custom npm tag and version suffix for testing. Inputs: base version + suffix (e.g. `1.0.0` + `test1` → npm version `1.0.0-test1`, npm tag `test1`). Can be triggered from any branch.

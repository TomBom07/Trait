# Releasing Trait

Trait releases are tag-driven so the source version, tested commit, tarball, and GitHub Release stay tied together.

## Release checklist

1. Update `package.json` and add the matching section in `CHANGELOG.md`.
2. Merge through normal CI. The main CI matrix must be green on Windows and Linux for the supported Node versions.
3. Create the version tag on the exact `main` commit:

```bash
git switch main
git pull --ff-only
git tag -a v1.0.0 -m "Trait v1.0.0"
git push origin v1.0.0
```

4. The `release` workflow verifies that `v1.0.0` matches the package version, reruns the test suite, creates the npm-format tarball, writes `SHA256SUMS.txt`, and creates the GitHub Release with generated release notes.

A mismatched tag fails before a release is created.

## npm

GitHub releases and npm publication are separate. Do not add an npm publish step until the intended npm scope/package ownership and authentication method are explicitly configured.

The repository package name is currently `@trait-dev/cli`. Publishing that name requires control of that npm scope; the GitHub workflow deliberately does not assume those credentials exist.

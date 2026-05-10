# setup-hylo

GitHub Action that installs the [Hylo](https://github.com/hylo-lang/hylo-new)
toolchain at an explicit release tag and prepends the `hc` compiler to `PATH`.

- **Supported runners:** Linux, macOS, Windows
- **Supported architectures:** `x64`, `arm64`
- Releases are pulled from
  [`hylo-lang/hylo-new`](https://github.com/hylo-lang/hylo-new/releases) using
  the archive `hylo-<tag>-<os>-<arch>.tar.zst`.

## Quickstart

```yaml
- uses: hylo-lang/setup-hylo@v1.0.0
  with:
    version: v0.0.1
```

An explicit release tag is required; `latest` is not supported.

## Reference

### Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `version` | yes | &mdash; | Hylo toolchain release tag to install (e.g. `v0.0.1`). |
| `useCloudCache`    | no  | `true`  | If `true`, cache the downloaded toolchain via the GitHub Actions cache. |

### Outputs

| Output | Description |
|--------|-------------|
| `hyloToolchainRootDirectory` | Absolute path to the installed toolchain directory (contains the `hc` binary). |

## How it works

1. Computes a cache key from the requested archive name.
2. If `useCloudCache` is `true`, attempts to restore the toolchain from the GitHub Actions cache.
3. On a cache miss, downloads `hylo-<version>-<os>-<arch>.tar.zst` from the matching
   `hylo-lang/hylo-new` release and extracts it.
4. Prepends the toolchain directory to `PATH` so `hc` resolves first.
5. Verifies `hc --help` succeeds.
6. On a cache miss with `useCloudCache: true`, saves the toolchain to the cache for future runs.

## Contributing

Contributing is welcome and encouraged. Check out [CONTRIBUTING.md](CONTRIBUTING.md) for more info.

## Credits

This package is based on [@lukka](https://github.com/lukka)'s [get-cmake](https://github.com/lukka/get-cmake) action. Thanks for all the work! This action has been through significant changes since then.

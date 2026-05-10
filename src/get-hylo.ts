// SPDX short identifier: MIT

import * as cache from "@actions/cache";
import * as core from "@actions/core";
import * as io from "@actions/io";
import * as tools from "@actions/tool-cache";
import * as path from "path";
import * as fs from "fs/promises";
import { execSync } from "child_process";
import { hashCode } from "./utils";

const DOWNLOAD_URL_PREFIX =
  "https://github.com/hylo-lang/hylo-new/releases/download";

function getOsName(): "linux" | "macos" | "windows" {
  switch (process.platform) {
    case "linux":
      return "linux";
    case "darwin":
      return "macos";
    case "win32":
      return "windows";
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

function getArchName(): "x64" | "arm64" {
  switch (process.arch) {
    case "x64":
      return "x64";
    case "arm64":
      return "arm64";
    default:
      throw new Error(`Unsupported architecture: ${process.arch}`);
  }
}

function getArchiveBaseName(version: string): string {
  return `hylo-${version}-${getOsName()}-${getArchName()}`;
}

function getArchiveFileName(version: string): string {
  return `${getArchiveBaseName(version)}.tar.zst`;
}

function getHcExecutableName(): string {
  return process.platform === "win32" ? "hc.exe" : "hc";
}

function normalizePathSeparators(p: string): string {
  return p.replaceAll("\\", "/");
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export class HyloToolchainGetter {
  public constructor(
    private readonly version: string,
    private readonly useCloudCache: boolean,
  ) {
    if (!version || !version.trim()) {
      throw new Error(
        "Input 'version' is required and must be an explicit release tag (e.g. 'v0.0.1').",
      );
    }
    core.info(`Hylo toolchain version: ${this.version}`);
    core.info(`useCloudCache: ${this.useCloudCache}`);
  }

  public async run(): Promise<void> {
    const archiveFileName = getArchiveFileName(this.version);
    const archiveBaseName = getArchiveBaseName(this.version);

    const cacheKeyText = `${archiveFileName}`;
    const hashedKey = hashCode(cacheKeyText);
    const outPath = this.getOutputPath(hashedKey.toString());
    const toolchainRoot = normalizePathSeparators(
      path.join(outPath, archiveBaseName),
    );

    core.info(`Cache key: '${cacheKeyText}' (hash: ${hashedKey}).`);
    core.info(`Toolchain install root: '${toolchainRoot}'.`);

    let cloudCacheHitKey: string | undefined;
    if (this.useCloudCache) {
      await core.group(
        `Restoring from GitHub cloud cache using key '${hashedKey}'`,
        async () => {
          cloudCacheHitKey = await this.restoreCache(outPath, hashedKey);
          core.info(
            cloudCacheHitKey === undefined
              ? "Cloud cache miss."
              : "Cloud cache hit.",
          );
        },
      );
    }

    if (cloudCacheHitKey === undefined) {
      await this.downloadAndExtract(archiveFileName, outPath);
    }

    if (!(await pathExists(toolchainRoot))) {
      throw new Error(
        `Expected toolchain root directory does not exist after install: ${toolchainRoot}`,
      );
    }

    core.setOutput("hyloToolchainRootDirectory", toolchainRoot);

    await this.prependToPath(toolchainRoot);
    await this.verifyHcOnPath();

    if (this.useCloudCache && cloudCacheHitKey === undefined) {
      await core.group(
        `Saving to GitHub cloud cache using key '${hashedKey}'`,
        async () => {
          await this.saveCache([outPath], hashedKey);
          core.info(
            `Saved '${outPath}' to the GitHub cache service with key '${hashedKey}'.`,
          );
        },
      );
    }
  }

  private getOutputPath(subDir: string): string {
    if (!process.env.RUNNER_TEMP) {
      throw new Error(
        "Environment variable RUNNER_TEMP must be set; it is used as the destination directory for the toolchain.",
      );
    }
    return path.join(process.env.RUNNER_TEMP, subDir);
  }

  private async downloadAndExtract(
    archiveFileName: string,
    outputPath: string,
  ): Promise<void> {
    const downloadUrl = `${DOWNLOAD_URL_PREFIX}/${this.version}/${archiveFileName}`;
    const archiveBaseName = archiveFileName.replace(/\.tar\.zst$/, "");
    const extractDir = path.join(outputPath, archiveBaseName);

    await core.group(`Downloading ${downloadUrl}`, async () => {
      const downloaded = await tools.downloadTool(downloadUrl);
      core.info(`Downloaded archive to: ${downloaded}`);
      await io.mkdirP(extractDir);
      core.info(`Extracting to: ${extractDir}`);
      await tools.extractTar(downloaded, extractDir, ["-x", "--zstd"]);
    });
  }

  private async prependToPath(toolchainRoot: string): Promise<void> {
    await core.group(
      `Prepending Hylo toolchain directory to PATH`,
      async () => {
        core.info(`Adding to PATH (front): ${toolchainRoot}`);
        // core.addPath prepends to PATH for subsequent steps and for the
        // current process via process.env.PATH.
        core.addPath(toolchainRoot);
      },
    );
  }

  private async verifyHcOnPath(): Promise<void> {
    await core.group(`Verifying 'hc' is on PATH`, async () => {
      const hcPath = await io.which(getHcExecutableName(), true);
      core.info(`'hc' resolved to: ${hcPath}`);

      try {
        const out = execSync(`hc --help`, {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
        core.info(`'hc --help' succeeded; first line: ${out.split("\n")[0]}`);
      } catch (err: any) {
        const status = err?.status;
        const signal = err?.signal;
        const stdout = (err?.stdout ?? "").toString();
        const stderr = (err?.stderr ?? "").toString();
        core.error(
          `'hc --help' failed (status=${status}, signal=${signal}).`,
        );
        if (stdout) core.error(`'hc --help' stdout:\n${stdout}`);
        if (stderr) core.error(`'hc --help' stderr:\n${stderr}`);
        try {
          const dirListing = await fs.readdir(path.dirname(hcPath));
          core.info(
            `Toolchain dir contents (${path.dirname(hcPath)}):\n${dirListing.join("\n")}`,
          );
        } catch (listErr) {
          core.warning(`Failed to list toolchain dir: ${listErr}`);
        }
        throw err;
      }
    });
  }

  private async saveCache(
    paths: string[],
    key: number,
  ): Promise<number | undefined> {
    try {
      return await cache.saveCache(paths, key.toString());
    } catch (error: any) {
      if (error.name === cache.ValidationError.name) {
        throw error;
      } else if (error.name === cache.ReserveCacheError.name) {
        core.info(error.message);
      } else {
        core.warning(error.message);
      }
    }
  }

  private restoreCache(
    outPath: string,
    key: number,
  ): Promise<string | undefined> {
    return cache.restoreCache([outPath], key.toString());
  }
}

function forceExit(exitCode: number): void {
  // Workaround for occasional hangs in @actions/* on Node when there are
  // lingering handles. Skipped under Jest to avoid terminating the test runner.
  if (process.env.JEST_WORKER_ID) return;
  process.exitCode = exitCode;
  process.exit(exitCode);
}

export async function main(): Promise<void> {
  try {
    const getter = new HyloToolchainGetter(
      core.getInput("version", { required: true }),
      (core.getInput("useCloudCache") || "true").toLowerCase() === "true",
    );
    await getter.run();
    core.info("setup-hylo action execution succeeded");
    forceExit(0);
  } catch (err) {
    const error = err as Error;
    if (error?.stack) {
      core.error(error.stack);
    }
    const errorAsString = (err ?? "undefined error").toString();
    core.setFailed(`setup-hylo action execution failed: '${errorAsString}'`);
    forceExit(-1000);
  }
}

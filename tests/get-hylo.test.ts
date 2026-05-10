// SPDX short identifier: MIT

import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import * as fsPromises from "fs/promises";
import * as cache from "@actions/cache";
import * as core from "@actions/core";
import * as io from "@actions/io";
import * as tools from "@actions/tool-cache";
import * as childProcess from "child_process";
import { HyloToolchainGetter, main } from "../src/get-hylo";

jest.setTimeout(2 * 60 * 1000);

function freshRunnerTemp(): void {
  const id = crypto.randomBytes(8).toString("hex");
  process.env.RUNNER_TEMP = path.join(os.tmpdir(), `setup-hylo-${id}`);
}

// Avoid actual network/disk side-effects.
const downloadTool = jest
  .spyOn(tools, "downloadTool")
  .mockImplementation(async () => "/tmp/fake-archive.tar.zst");
const extractTar = jest
  .spyOn(tools, "extractTar")
  .mockImplementation(async (_a, dest) => dest as string);
jest.spyOn(io, "mkdirP").mockImplementation(async () => {});
// io.which is used to verify hc is on PATH; pretend it is.
jest
  .spyOn(io, "which")
  .mockImplementation(async () => "/fake/toolchain/hc");
// Pretend the extracted toolchain root exists.
jest.spyOn(fsPromises, "access").mockImplementation(async () => {});
// Pretend `hc --help` succeeds.
jest
  .spyOn(childProcess, "execSync")
  .mockImplementation((() => "hc help text\n") as any);

const restoreCache = jest
  .spyOn(cache, "restoreCache")
  .mockResolvedValue(undefined);
const saveCache = jest.spyOn(cache, "saveCache").mockResolvedValue(0);

const setFailed = jest.spyOn(core, "setFailed");
const coreError = jest.spyOn(core, "error");

beforeEach(() => {
  jest.clearAllMocks();
  // Reset default impls cleared by clearAllMocks.
  downloadTool.mockResolvedValue("/tmp/fake-archive.tar.zst");
  extractTar.mockImplementation(async (_a, dest) => dest as string);
  restoreCache.mockResolvedValue(undefined);
  saveCache.mockResolvedValue(0);
});

test("downloads and saves to cloud cache on cache miss", async () => {
  freshRunnerTemp();
  const getter = new HyloToolchainGetter("v0.0.1", true);
  await getter.run();
  expect(restoreCache).toHaveBeenCalledTimes(1);
  expect(downloadTool).toHaveBeenCalledTimes(1);
  expect(extractTar).toHaveBeenCalledTimes(1);
  expect(saveCache).toHaveBeenCalledTimes(1);
});

test("skips download and save on cloud cache hit", async () => {
  freshRunnerTemp();
  restoreCache.mockResolvedValueOnce("hit-key");
  const getter = new HyloToolchainGetter("v0.0.1", true);
  await getter.run();
  expect(restoreCache).toHaveBeenCalledTimes(1);
  expect(downloadTool).toHaveBeenCalledTimes(0);
  expect(saveCache).toHaveBeenCalledTimes(0);
});

test("skips cloud cache entirely when useCloudCache=false", async () => {
  freshRunnerTemp();
  const getter = new HyloToolchainGetter("v0.0.1", false);
  await getter.run();
  expect(restoreCache).toHaveBeenCalledTimes(0);
  expect(saveCache).toHaveBeenCalledTimes(0);
  expect(downloadTool).toHaveBeenCalledTimes(1);
});

test("download URL targets the requested release tag and host triple", async () => {
  freshRunnerTemp();
  await new HyloToolchainGetter("v0.0.1", false).run();
  const url = downloadTool.mock.calls[0][0] as string;
  expect(url).toMatch(
    /\/hylo-lang\/hylo-new\/releases\/download\/v0\.0\.1\/hylo-v0\.0\.1-(linux|macos|windows)-(x64|arm64)\.tar\.zst$/,
  );
});

test("constructor rejects empty version", () => {
  expect(() => new HyloToolchainGetter("", true)).toThrow(/version/);
  expect(() => new HyloToolchainGetter("   ", true)).toThrow(/version/);
});

test("run() throws when RUNNER_TEMP is not set", async () => {
  delete process.env.RUNNER_TEMP;
  await expect(new HyloToolchainGetter("v0.0.1", false).run()).rejects.toThrow(
    /RUNNER_TEMP/,
  );
});

test("main() requires version input", async () => {
  freshRunnerTemp();
  const getInput = jest
    .spyOn(core, "getInput")
    .mockImplementation((name: string) => {
      if (name === "version") return "";
      if (name === "useCloudCache") return "false";
      return "";
    });
  setFailed.mockImplementation(() => {});
  coreError.mockImplementation(() => {});
  await main();
  expect(setFailed).toHaveBeenCalledTimes(1);
  getInput.mockRestore();
});

test("main() succeeds with explicit version", async () => {
  freshRunnerTemp();
  const getInput = jest
    .spyOn(core, "getInput")
    .mockImplementation((name: string) => {
      if (name === "version") return "v0.0.1";
      if (name === "useCloudCache") return "false";
      return "";
    });
  setFailed.mockImplementation(() => {});
  await main();
  expect(setFailed).toHaveBeenCalledTimes(0);
  getInput.mockRestore();
});

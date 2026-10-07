import React, { useCallback, useState } from "react";

import {
  instantiate,
  detectGPUDevice,
  createPolyfillWASI,
} from "../mlc/tvm";

const MODEL_DIR = "/mlc/nemotron-mini-4b-q4f16_1";
const MODEL_WASM =
  "/mlc/nemotron-mini-4b-q4f16_1-webgpu.wasm";

const SHARD_COUNT = 52;

type LogType =
  | "normal"
  | "success"
  | "error"
  | "info";

interface LogLine {
  text: string;
  type: LogType;
}

export default function NemotronTest() {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState("");
  const [gpuDevice, setGpuDevice] =
    useState<GPUDevice | null>(null);

  const log = useCallback(
    (text: string, type: LogType = "normal") => {
      console.log(text);

      setLogs((previous) => [
        ...previous,
        {
          text,
          type,
        },
      ]);
    },
    [],
  );

  const clearLogs = () => {
    setLogs([]);
    setResult("");
  };

  /*
   * ------------------------------------------------------------
   * WEBGPU
   * ------------------------------------------------------------
   */

  async function initializeWebGPU(): Promise<GPUDevice> {
    log("");
    log("========================================");
    log("1. WEBGPU");
    log("========================================");

    if (
      typeof navigator === "undefined" ||
      !navigator.gpu
    ) {
      throw new Error(
        "navigator.gpu is not available. WebGPU is not supported.",
      );
    }

    log("Requesting WebGPU device...");

    const gpu = await detectGPUDevice(
      "high-performance",
    );

    if (!gpu) {
      throw new Error(
        "Could not create a WebGPU device.",
      );
    }

    const device = gpu.device;

    setGpuDevice(device);

    log("WebGPU initialization: OK", "success");

    if (gpu.adapterInfo) {
      log(
        `Adapter: ${
          gpu.adapterInfo.description ||
          gpu.adapterInfo.device ||
          "Unknown"
        }`,
        "info",
      );

      if (gpu.adapterInfo.vendor) {
        log(
          `Vendor: ${gpu.adapterInfo.vendor}`,
          "info",
        );
      }

      if (gpu.adapterInfo.architecture) {
        log(
          `Architecture: ${gpu.adapterInfo.architecture}`,
          "info",
        );
      }
    }

    log(
      `maxBufferSize: ${device.limits.maxBufferSize}`,
      "info",
    );

    log(
      `maxStorageBufferBindingSize: ${
        device.limits.maxStorageBufferBindingSize
      }`,
      "info",
    );

    log(
      `maxComputeWorkgroupStorageSize: ${
        device.limits.maxComputeWorkgroupStorageSize
      }`,
      "info",
    );

    log(
      `maxComputeInvocationsPerWorkgroup: ${
        device.limits.maxComputeInvocationsPerWorkgroup
      }`,
      "info",
    );

    return device;
  }

  /*
   * ------------------------------------------------------------
   * MODEL FILES
   * ------------------------------------------------------------
   */

  async function checkFile(
    path: string,
  ): Promise<number> {
    const response = await fetch(path, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `${path}: HTTP ${response.status}`,
      );
    }

    const buffer =
      await response.arrayBuffer();

    if (buffer.byteLength === 0) {
      throw new Error(
        `${path}: returned 0 bytes.`,
      );
    }

    return buffer.byteLength;
  }

  async function checkModelFiles() {
    log("");
    log("========================================");
    log("2. MODEL FILES");
    log("========================================");

    const requiredFiles = [
      "mlc-chat-config.json",
      "tokenizer_config.json",
      "tokenizer.json",
      "tokenizer.model",
      "tensor-cache.json",
    ];

    for (const filename of requiredFiles) {
      const path =
        `${MODEL_DIR}/${filename}`;

      const size =
        await checkFile(path);

      log(
        `${filename}: ${formatBytes(size)}`,
        "success",
      );
    }

    log("");
    log("Checking parameter shards...");

    /*
     * Your model contains exactly:
     *
     * params_shard_0.bin
     * ...
     * params_shard_51.bin
     *
     * Do NOT use:
     *
     * while(true)
     *
     * here.
     *
     * Some Vite/Tauri configurations can return a successful
     * response for nonexistent files, which makes an unbounded
     * discovery loop continue forever.
     */

    let totalBytes = 0;

    for (
      let shard = 0;
      shard < SHARD_COUNT;
      shard++
    ) {
      const path =
        `${MODEL_DIR}/params_shard_${shard}.bin`;

      const size =
        await checkFile(path);

      totalBytes += size;

      log(
        `shard ${shard}: ${formatBytes(size)}`,
        "success",
      );
    }

    log("");
    log(
      `All ${SHARD_COUNT} parameter shards loaded.`,
      "success",
    );

    log(
      `Total parameter data: ${formatBytes(
        totalBytes,
      )}`,
      "info",
    );
  }

  /*
   * ------------------------------------------------------------
   * MODEL WASM
   * ------------------------------------------------------------
   */

  async function loadModelWasm(): Promise<ArrayBuffer> {
    log("");
    log("========================================");
    log("3. MODEL WASM");
    log("========================================");

    log(`Fetching: ${MODEL_WASM}`);

    const response = await fetch(
      MODEL_WASM,
      {
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(
        `Could not fetch model WASM: HTTP ${response.status}`,
      );
    }

    /*
     * IMPORTANT:
     *
     * Keep this as ArrayBuffer.
     *
     * TVM's instantiate() in your source tree expects:
     *
     * instantiate(bufferSource: ArrayBuffer, ...)
     *
     * not:
     *
     * instantiate(WebAssembly.Module, ...)
     */
    const buffer =
      await response.arrayBuffer();

    if (buffer.byteLength === 0) {
      throw new Error(
        "Model WASM returned 0 bytes.",
      );
    }

    log(
      `Loaded ${formatBytes(
        buffer.byteLength,
      )}`,
      "success",
    );

    /*
     * WebAssembly magic:
     *
     * 00 61 73 6d
     */

    if (buffer.byteLength < 8) {
      throw new Error(
        "WASM file is too small.",
      );
    }

    const bytes =
      new Uint8Array(buffer);

    if (
      bytes[0] !== 0x00 ||
      bytes[1] !== 0x61 ||
      bytes[2] !== 0x73 ||
      bytes[3] !== 0x6d
    ) {
      throw new Error(
        "Invalid WebAssembly magic.",
      );
    }

    log(
      "WASM magic: OK",
      "success",
    );

    /*
     * Compile once simply to verify that the browser
     * accepts the generated model WASM.
     */

    const wasmModule =
      await WebAssembly.compile(
        buffer,
      );

    log(
      "WebAssembly.compile(): OK",
      "success",
    );

    /*
     * Diagnostics.
     */

    const imports =
      WebAssembly.Module.imports(
        wasmModule,
      );

    log(
      `Imports: ${imports.length}`,
      "info",
    );

    for (const item of imports) {
      log(
        `  ${item.module}.${item.name} (${item.kind})`,
      );
    }

    const exports =
      WebAssembly.Module.exports(
        wasmModule,
      );

    log(
      `Exports: ${exports.length}`,
      "info",
    );

    for (
      const item of exports.slice(0, 30)
    ) {
      log(
        `  ${item.name} (${item.kind})`,
      );
    }

    if (exports.length > 30) {
      log(
        `  ... ${
          exports.length - 30
        } more exports`,
      );
    }

    return buffer;
  }

  /*
   * ------------------------------------------------------------
   * TVM RUNTIME
   * ------------------------------------------------------------
   */

  async function initializeTVM(
    wasmBuffer: ArrayBuffer,
    device: GPUDevice,
  ) {
    log("");
    log("========================================");
    log("4. TVM RUNTIME");
    log("========================================");

    /*
     * Your model WASM imports:
     *
     * wasi_snapshot_preview1
     *
     * therefore we cannot instantiate it with:
     *
     * WebAssembly.instantiate(buffer, {})
     *
     * The TVM Environment needs the WASI/polyfill provider.
     */

    const wasi =
      createPolyfillWASI();

    log(
      "WASI/polyfill created.",
      "success",
    );

    /*
     * IMPORTANT:
     *
     * Your TVM runtime's instantiate() definition is:
     *
     * export function instantiate(
     *   bufferSource: ArrayBuffer,
     *   importObject: Record<string, any> = {},
     *   ...
     * )
     *
     * Therefore pass the ORIGINAL ArrayBuffer.
     */

    const instance =
      await instantiate(
        wasmBuffer,
        wasi,
      );

    log(
      "TVM WASM runtime instantiated.",
      "success",
    );

    /*
     * Connect the TVM runtime to WebGPU.
     */

    instance.initWebGPU(device);

    log(
      "TVM WebGPU context initialized.",
      "success",
    );

    return instance;
  }

  /*
   * ------------------------------------------------------------
   * COMPLETE TEST
   * ------------------------------------------------------------
   */

  async function runTest() {
    if (running) {
      return;
    }

    setRunning(true);
    setResult("");
    setLogs([]);

    try {
      log(
        "========================================",
      );

      log(
        "NEMOTRON / TVM WEBGPU TEST",
      );

      log(
        "========================================",
      );

      log(
        "Model: Nemotron Mini 4B",
        "info",
      );

      /*
       * 1. WebGPU
       */

      const device =
        await initializeWebGPU();

      /*
       * 2. Model files
       */

      await checkModelFiles();

      /*
       * 3. Model WASM
       */

      const wasmBuffer =
        await loadModelWasm();

      /*
       * 4. TVM
       */

      const instance =
        await initializeTVM(
          wasmBuffer,
          device,
        );

      /*
       * If we reach here, the model WASM was instantiated
       * through the TVM environment and connected to WebGPU.
       */

      log("");
      log(
        "========================================",
      );

      log(
        "RESULT",
      );

      log(
        "========================================",
      );

      log(
        "WebGPU: OK",
        "success",
      );

      log(
        "Model files: OK",
        "success",
      );

      log(
        "Model WASM: OK",
        "success",
      );

      log(
        "TVM runtime: OK",
        "success",
      );

      log(
        "TVM WebGPU: OK",
        "success",
      );

      setResult(
        "The generated Nemotron model WASM has been connected to the TVM WebGPU runtime.",
      );

      /*
       * Keep a reference for browser debugging.
       */

      (
        window as any
      ).nemotronTVM = instance;

      (
        window as any
      ).nemotronGPUDevice = device;

      console.log(
        "Nemotron TVM instance:",
        instance,
      );

      console.log(
        "Nemotron GPU device:",
        device,
      );
    } catch (error) {
      console.error(
        "Nemotron initialization failed:",
        error,
      );

      const err =
        error instanceof Error
          ? error
          : new Error(
              String(error),
            );

      log("");
      log(
        "========================================",
      );

      log(
        "INITIALIZATION FAILED",
        "error",
      );

      log(
        "========================================",
      );

      log(
        `Name: ${err.name}`,
        "error",
      );

      log(
        `Message: ${err.message}`,
        "error",
      );

      if (err.stack) {
        log(
          "Stack:",
          "error",
        );

        log(
          err.stack,
          "error",
        );
      }

      setResult(
        `${err.name}: ${err.message}`,
      );
    } finally {
      setRunning(false);
    }
  }

  /*
   * ------------------------------------------------------------
   * UI
   * ------------------------------------------------------------
   */

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0b0f14",
        color: "#e6edf3",
        padding: "32px",
        boxSizing: "border-box",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      }}
    >
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
        }}
      >
        <h1
          style={{
            margin: "0 0 8px",
            fontSize: "26px",
          }}
        >
          Nemotron Mini 4B
        </h1>

        <div
          style={{
            color: "#8b949e",
            marginBottom: "24px",
          }}
        >
          TVM + WebGPU runtime test
        </div>

        <div
          style={{
            display: "flex",
            gap: "12px",
            marginBottom: "20px",
          }}
        >
          <button
            onClick={runTest}
            disabled={running}
            style={{
              padding:
                "10px 18px",
              border: "none",
              borderRadius: "6px",
              background: running
                ? "#30363d"
                : "#238636",
              color: "#fff",
              fontSize: "14px",
              fontWeight: 600,
              cursor: running
                ? "not-allowed"
                : "pointer",
            }}
          >
            {running
              ? "Initializing..."
              : "Initialize Nemotron"}
          </button>

          <button
            onClick={clearLogs}
            disabled={running}
            style={{
              padding:
                "10px 18px",
              border:
                "1px solid #30363d",
              borderRadius: "6px",
              background:
                "#161b22",
              color:
                "#e6edf3",
              fontSize: "14px",
              cursor: running
                ? "not-allowed"
                : "pointer",
            }}
          >
            Clear
          </button>
        </div>

        {gpuDevice && (
          <div
            style={{
              marginBottom: "16px",
              padding: "12px 14px",
              border:
                "1px solid #30363d",
              borderRadius: "6px",
              background:
                "#161b22",
              color:
                "#3fb950",
            }}
          >
            WebGPU device initialized
          </div>
        )}

        {result && (
          <div
            style={{
              marginBottom: "16px",
              padding: "14px",
              borderRadius: "6px",
              border:
                "1px solid #30363d",
              background:
                result.includes(":")
                  ? "#3d1616"
                  : "#122117",
              color:
                result.includes(":")
                  ? "#ff7b72"
                  : "#3fb950",
            }}
          >
            {result}
          </div>
        )}

        <div
          style={{
            background: "#010409",
            border:
              "1px solid #30363d",
            borderRadius: "8px",
            padding: "16px",
            minHeight: "500px",
            maxHeight: "700px",
            overflow: "auto",
          }}
        >
          {logs.length === 0 ? (
            <div
              style={{
                color: "#484f58",
              }}
            >
              Press "Initialize Nemotron" to
              begin.
            </div>
          ) : (
            logs.map(
              (
                entry,
                index,
              ) => (
                <div
                  key={index}
                  style={{
                    whiteSpace:
                      "pre-wrap",
                    wordBreak:
                      "break-word",
                    marginBottom:
                      "4px",
                    lineHeight:
                      "1.4",
                    color:
                      entry.type ===
                      "error"
                        ? "#ff7b72"
                        : entry.type ===
                            "success"
                          ? "#3fb950"
                          : entry.type ===
                              "info"
                            ? "#58a6ff"
                            : "#c9d1d9",
                  }}
                >
                  {entry.text}
                </div>
              ),
            )
          )}
        </div>
      </div>
    </div>
  );
}

/*
 * ------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------
 */

function formatBytes(
  bytes: number,
): string {
  if (!Number.isFinite(bytes)) {
    return "0 B";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(
      bytes / 1024
    ).toFixed(2)} KiB`;
  }

  if (
    bytes <
    1024 * 1024 * 1024
  ) {
    return `${(
      bytes /
      (1024 * 1024)
    ).toFixed(2)} MiB`;
  }

  return `${(
    bytes /
    (1024 * 1024 * 1024)
  ).toFixed(2)} GiB`;
}


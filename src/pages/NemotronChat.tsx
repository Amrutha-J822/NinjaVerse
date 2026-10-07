import React, { useRef, useState, useEffect, createContext } from "react";
import {
  CreateMLCEngine,
  type MLCEngineInterface,
  type InitProgressReport,
} from "@mlc-ai/web-llm";

const MODEL_ID = "Nemotron-Mini-4B-q4f16_1";

const MODEL_URL = "/mlc/nemotron-mini-4b-q4f16_1";

const MODEL_WASM =
  "/mlc/nemotron-mini-4b-q4f16_1-webgpu.wasm";

const appConfig = {
  model_list: [
    {
      model: new URL(
        "/mlc/nemotron-mini-4b-q4f16_1",
        window.location.origin
      ).toString(),
      model_id: MODEL_ID,
      model_lib: MODEL_WASM,

      vram_required_MB: 2300,
      low_resource_required: true,

      overrides: {
        context_window_size: 1000,
      },
    },
  ],
};

export const NemotronContext = createContext<{
  engine: MLCEngineInterface | null;
  status: string;
  progress: string;
  progressPercent: number;
  loading: boolean;
  generating: boolean;
}>({
  engine: null,
  status: 'Model not loaded',
  progress: '',
  progressPercent: 0,
  loading: false,
  generating: false,
});

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function NemotronChat() {
  const engineRef = useRef<MLCEngineInterface | null>(null);

  const [status, setStatus] = useState("Model not loaded");
  const [progress, setProgress] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);

  const [messages, setMessages] = useState<Message[]>([]);

  const [input, setInput] = useState("");

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [engineReady, setEngineReady] = useState(false);


  // ------------------------------------------------------------
  // AUTO LOAD MODEL & GAME LOOP
  // ------------------------------------------------------------

  useEffect(() => {
    // Auto‑load model on mount
    void initialize();

    return;
  }, []);

  // ------------------------------------------------------------
  // LOAD MODEL
  // ------------------------------------------------------------

  const initialize = async () => {
    if (engineRef.current) {
      return;
    }

    try {
      setLoading(true);
      setStatus("Loading Nemotron...");
      setProgress("");

      const engine = await CreateMLCEngine(
        MODEL_ID,
        {
          appConfig,

          initProgressCallback: (
            report: InitProgressReport
          ) => {
            console.log(report);

            setProgress(
              `${report.text} ${
                report.progress !== undefined
                  ? Math.round(report.progress * 100) + "%"
                  : ""
              }`
            );
            if (report.progress !== undefined) {
              setProgressPercent(Math.round(report.progress * 100));
            }
          },
        }
      );

      engineRef.current = engine;
      setEngineReady(true);

      setStatus("Ready");
      setProgress("Nemotron is ready.");

      console.log("Nemotron engine initialized:", engine);
    } catch (error) {
      console.error(error);

      setStatus("Initialization failed");

      setProgress(
        error instanceof Error
          ? error.message
          : String(error)
      );
    } finally {
      setLoading(false);
    }
  };

  // Auto-load model on mount
  useEffect(() => {
    void initialize();

    return;
  }, []);

  // ------------------------------------------------------------
  // SEND MESSAGE (chat)
  // ------------------------------------------------------------

  const sendMessage = async () => {
    const engine = engineRef.current;

    if (!engine) {
      setStatus("Load the model first.");
      return;
    }

    const text = input.trim();

    if (!text || generating) {
      return;
    }

    setInput("");

    const userMessage: Message = {
      role: "user",
      content: text,
    };

    const updatedMessages = [
      ...messages,
      userMessage,
    ];

    setMessages(updatedMessages);
    setGenerating(true);
    setStatus("Generating...");

    try {
      // Add an empty assistant message immediately.
      setMessages([
        ...updatedMessages,
        {
          role: "assistant",
          content: "",
        },
      ]);

      const stream =
        await engine.chat.completions.create({
          messages: updatedMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),

          temperature: 0.7,
          top_p: 0.9,

          max_tokens: 512,

          stream: true,
        });

      let assistantText = "";

      for await (const chunk of stream) {
        const delta =
          chunk.choices?.[0]?.delta?.content ?? "";

        assistantText += delta;

        setMessages([
          ...updatedMessages,
          {
            role: "assistant",
            content: assistantText,
          },
        ]);
      }

      // Make sure the final response is stored.
      setMessages([
        ...updatedMessages,
        {
          role: "assistant",
          content: assistantText,
        },
      ]);

      setStatus("Ready");
    } catch (error) {
      console.error(error);

      setStatus("Generation failed");

      const errorText =
        error instanceof Error
          ? error.message
          : String(error);

      setMessages([
        ...updatedMessages,
        {
          role: "assistant",
          content: `Error: ${errorText}`,
        },
      ]);
    } finally {
      setGenerating(false);
    }
  };

  // ------------------------------------------------------------
  // KEYBOARD
  // ------------------------------------------------------------

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      void sendMessage();
    }
  };

  // ------------------------------------------------------------
  // CLEAR CHAT
  // ------------------------------------------------------------

  const clearChat = () => {
    setMessages([]);
    setInput("");
    setStatus(
      engineRef.current
        ? "Ready"
        : "Model not loaded"
    );
  };

  // ------------------------------------------------------------
  // UI
  // ------------------------------------------------------------

  return (
    <NemotronContext.Provider
      value={{
        engine: engineRef.current,
        status,
        progress,
        progressPercent,
        loading,
        generating,
      }}
    >
      <div
        style={{
          minHeight: "100vh",
          background: "#0b0b0f",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        {/* Header */}

        <header
          style={{
            borderBottom:
              "1px solid #292932",
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent:
              "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 600,
              }}
            >
              Nemotron Mini 4B
            </div>

            <div
              style={{
                color: "#888",
                fontSize: 13,
                marginTop: 4,
              }}
            >
              Local WebGPU inference
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                color:
                  status === "Ready"
                    ? "#4ade80"
                    : "#aaa",
                fontSize: 13,
              }}
            >
              ● {status}
            </div>

            {messages.length > 0 && (
              <button
                onClick={clearChat}
                disabled={generating}
                style={{
                  background: "#222229",
                  border: "1px solid #383842",
                  color: "#ccc",
                  padding:
                    "7px 12px",
                  borderRadius: 6,
                  cursor: generating
                    ? "default"
                    : "pointer",
                }}
              >
                Clear
              </button>
            )}
          </div>
        </header>

        {/* Loading */}

        {!engineRef.current && (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              borderBottom:
                "1px solid #202027",
            }}
          >
            <button
              onClick={() => void initialize()}
              disabled={loading}
              style={{
                background:
                  loading
                    ? "#333"
                    : "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding:
                  "12px 24px",
                fontSize: 15,
                cursor: loading
                  ? "default"
                  : "pointer",
              }}
            >
              {loading
                ? "Loading model..."
                : "Load Nemotron"}
            </button>

            {progress && (
              <div
                style={{
                  marginTop: 12,
                  color: "#888",
                  fontSize: 13,
                }}
              >
                {progress}
              </div>
            )}
          </div>
        )}

        {/* Chat */}

        <main
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "32px 16px",
          }}
        >
          <div
            style={{
              maxWidth: 850,
              margin: "0 auto",
            }}
          >
            {messages.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  marginTop: 100,
                  color: "#666",
                }}
              >
                <div
                  style={{
                    fontSize: 28,
                    marginBottom: 12,
                    color: "#aaa",
                  }}
                >
                  Nemotron
                </div>

                <div>
                  Ask anything to start
                  chatting.
                </div>
              </div>
            )}

            {messages.map(
              (message, index) => (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    justifyContent:
                      message.role ===
                      "user"
                        ? "flex-end"
                        : "flex-start",
                    marginBottom: 20,
                  }}
                >
                  <div
                    style={{
                      maxWidth: "80%",
                      background:
                        message.role ===
                        "user"
                          ? "#2563eb"
                          : "#1b1b22",
                      border:
                        message.role ===
                        "assistant"
                          ? "1px solid #2a2a34"
                          : "none",
                      borderRadius: 12,
                      padding:
                        "12px 16px",
                      lineHeight: 1.6,
                      whiteSpace:
                        "pre-wrap",
                      overflowWrap:
                        "break-word",
                    }}
                  >
                    {message.content ||
                      (generating &&
                      message.role ===
                        "assistant"
                          ? "..."
                          : "")}
                  </div>
                </div>
              )
            )}

            {generating && (
              <div
                style={{
                  color: "#666",
                  fontSize: 12,
                  marginTop: 8,
                }}
              >
                Nemotron is generating...
              </div>
            )}
          </div>
        </main>

        {/* Input */}

        <footer
          style={{
            borderTop:
              "1px solid #292932",
            padding: 16,
            background: "#0b0b0f",
          }}
        >
          <div
            style={{
              maxWidth: 850,
              margin: "0 auto",
              display: "flex",
              gap: 10,
              alignItems: "flex-end",
            }}
          >
            <textarea
              value={input}
              onChange={(event) =>
                setInput(
                  event.target.value
                )
              }
              onKeyDown={handleKeyDown}
              disabled={
                !engineRef.current ||
                generating
              }
              placeholder={
                engineRef.current
                  ? "Message Nemotron..."
                  : "Load the model first..."
              }
              rows={3}
              style={{
                flex: 1,
                resize: "none",
                background: "#17171d",
                color: "#fff",
                border:
                  "1px solid #30303a",
                borderRadius: 10,
                padding: 12,
                fontSize: 15,
                outline: "none",
                fontFamily:
                  "inherit",
              }}
            />

            <button
              onClick={() =>
                void sendMessage()
              }
              disabled={
                !engineRef.current ||
                generating ||
                !input.trim()
              }
              style={{
                background:
                  !engineRef.current ||
                  generating ||
                  !input.trim()
                    ? "#333"
                    : "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding:
                  "12px 18px",
                height: 48,
                cursor:
                  !engineRef.current ||
                  generating ||
                  !input.trim()
                    ? "default"
                    : "pointer",
                fontSize: 14,
              }}
            >
              {generating
                ? "..."
                : "Send"}
            </button>
          </div>

          <div
            style={{
              maxWidth: 850,
              margin: "8px auto 0",
              color: "#555",
              fontSize: 11,
            }}
          >
            Enter to send · Shift+Enter
            for a new line
          </div>
        </footer>
      </div>
    </NemotronContext.Provider>
  );
}
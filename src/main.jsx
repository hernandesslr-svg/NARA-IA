import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CreateMLCEngine } from "@mlc-ai/web-llm";
import { pipeline, env } from "@huggingface/transformers";
import "./style.css";

env.allowLocalModels = false;
env.useBrowserCache = true;

function App() {
  const [messages, setMessages] = useState([{ role: "assistant", content: "Oi! Eu sou a Nara. Toque em “Iniciar IA” para preparar o modelo. Se o WebGPU não estiver disponível, vou tentar o modo CPU." }]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("IA não carregada");
  const [busy, setBusy] = useState(false);
  const engine = useRef(null);
  const mode = useRef(null);

  async function load() {
    if (busy || engine.current) return;
    setBusy(true);
    setStatus("Tentando iniciar o modelo acelerado…");
    try {
      engine.current = await CreateMLCEngine("Qwen2.5-1.5B-Instruct-q4f16_1-MLC", {
        initProgressCallback: p => setStatus(p.text || "Preparando modelo acelerado…")
      });
      mode.current = "webllm";
      setStatus("IA local pronta (GPU)");
      setMessages(m => [...m, { role: "assistant", content: "Estou pronta para conversar no modo acelerado." }]);
    } catch (gpuError) {
      setStatus("WebGPU indisponível; preparando modo CPU…");
      try {
        engine.current = await pipeline("text-generation", "onnx-community/Qwen2.5-0.5B-Instruct", {
          dtype: "q4",
          device: "wasm",
          progress_callback: p => {
            if (p.status === "progress" && p.progress != null) setStatus("Baixando modelo CPU: " + Math.round(p.progress) + "%");
            else if (p.status) setStatus("Modelo CPU: " + p.status);
          }
        });
        mode.current = "transformers";
        setStatus("IA local pronta (CPU)");
        setMessages(m => [...m, { role: "assistant", content: "O WebGPU não estava disponível, então iniciei o modelo menor usando CPU. As respostas podem ser mais lentas." }]);
      } catch (cpuError) {
        setStatus("Não foi possível carregar a IA");
        setMessages(m => [...m, { role: "assistant", content: "Não consegui iniciar o modelo local nem pela GPU nem pela CPU. Verifique a internet, o espaço livre e tente novamente. Erro GPU: " + (gpuError?.message || String(gpuError)) + " | Erro CPU: " + (cpuError?.message || String(cpuError)) }]);
      }
    } finally { setBusy(false); }
  }

  async function send(e) {
    e.preventDefault();
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    const next = [...messages, { role: "user", content: q }];
    setMessages(next);
    if (!engine.current) {
      setMessages(m => [...m, { role: "assistant", content: "Toque em “Iniciar IA” primeiro para carregar o modelo." }]);
      return;
    }
    setBusy(true);
    setStatus("Nara está pensando…");
    try {
      let answer = "";
      if (mode.current === "webllm") {
        const r = await engine.current.chat.completions.create({
          messages: [{ role: "system", content: "Seu nome é Nara. Você é uma assistente pessoal prestativa e fala português brasileiro." }, ...next.map(m => ({ role: m.role, content: m.content }))],
          temperature: 0.7, max_tokens: 600
        });
        answer = r.choices?.[0]?.message?.content || "Não consegui responder.";
      } else {
        const transcript = next.map(m => (m.role === "user" ? "Usuário: " : "Nara: ") + m.content).join("\n") + "\nNara:";
        const r = await engine.current(transcript, { max_new_tokens: 350, do_sample: true, temperature: 0.7, return_full_text: false });
        answer = Array.isArray(r) ? (r[0]?.generated_text || "") : (r.generated_text || "");
        answer = answer.trim() || "Não consegui gerar uma resposta.";
      }
      setMessages(m => [...m, { role: "assistant", content: answer }]);
      setStatus(mode.current === "webllm" ? "IA local pronta (GPU)" : "IA local pronta (CPU)");
    } catch (err) {
      setMessages(m => [...m, { role: "assistant", content: "Erro ao gerar resposta: " + (err?.message || String(err)) }]);
      setStatus("Erro ao responder");
    } finally { setBusy(false); }
  }

  return <main>
    <header><div className="logo">N</div><div><h1>Nara</h1><p>Sua IA pessoal · processamento local experimental</p></div></header>
    <section className="status"><span>{status}</span><button onClick={load} disabled={busy || !!engine.current}>{engine.current ? "IA carregada" : busy ? "Preparando…" : "Iniciar IA"}</button></section>
    <section className="chat">{messages.map((m, i) => <article className={m.role} key={i}><b>{m.role === "user" ? "Você" : "Nara"}</b><p>{m.content}</p></article>)}</section>
    <form onSubmit={send}><input value={input} onChange={e => setInput(e.target.value)} placeholder="Converse com a Nara…" /><button disabled={busy || !input.trim()}>Enviar</button></form>
    <small className="note">O primeiro uso baixa arquivos do modelo. O modo CPU pode ser lento e consumir bastante memória. Não envie informações sensíveis durante os testes.</small>
  </main>;
}
createRoot(document.getElementById("root")).render(<App />);

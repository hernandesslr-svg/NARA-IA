import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { pipeline, env } from "@huggingface/transformers";
import "./style.css";

env.allowLocalModels = false;
env.useBrowserCache = true;

function App() {
  const [messages, setMessages] = useState([{ role: "assistant", content: "Oi! Eu sou a Nara. Toque em “Iniciar IA” para baixar e preparar meu modelo compacto para celular." }]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("IA não carregada");
  const [busy, setBusy] = useState(false);
  const engine = useRef(null);

  async function load() {
    if (busy || engine.current) return;
    setBusy(true);
    setStatus("Preparando modelo compacto para celular…");
    try {
      engine.current = await pipeline("text-generation", "onnx-community/SmolLM2-135M-Instruct", {
        dtype: "q4",
        device: "wasm",
        progress_callback: p => {
          if (p.status === "progress" && p.progress != null) {
            setStatus("Baixando modelo: " + Math.round(p.progress) + "%");
          } else if (p.status === "done") {
            setStatus("Arquivo baixado; inicializando IA…");
          } else if (p.status) {
            setStatus("Preparando IA: " + p.status);
          }
        }
      });
      setStatus("Nara pronta (CPU)");
      setMessages(m => [...m, { role: "assistant", content: "Pronto! Carreguei meu modelo compacto usando CPU. Pode conversar comigo. Como é um modelo pequeno, algumas respostas podem ser simples ou lentas." }]);
    } catch (err) {
      engine.current = null;
      setStatus("Falha ao carregar modelo");
      setMessages(m => [...m, { role: "assistant", content: "Não consegui carregar o modelo compacto. Confira a conexão e o espaço livre e tente novamente. Detalhe: " + (err?.message || String(err)) }]);
    } finally {
      setBusy(false);
    }
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
      const prompt = "Você é Nara, uma assistente pessoal que responde em português brasileiro. Seja útil e clara.\n\n" +
        next.slice(-8).map(m => (m.role === "user" ? "Usuário: " : "Nara: ") + m.content).join("\n") +
        "\nNara:";
      const result = await engine.current(prompt, {
        max_new_tokens: 180,
        do_sample: false,
        return_full_text: false
      });
      const answer = Array.isArray(result) ? result[0]?.generated_text : result?.generated_text;
      setMessages(m => [...m, { role: "assistant", content: (answer || "").trim() || "Não consegui gerar uma resposta. Tente perguntar de outro jeito." }]);
      setStatus("Nara pronta (CPU)");
    } catch (err) {
      setMessages(m => [...m, { role: "assistant", content: "Ocorreu um erro ao gerar a resposta: " + (err?.message || String(err)) }]);
      setStatus("Erro ao responder");
    } finally {
      setBusy(false);
    }
  }

  return <main>
    <header><div className="logo">N</div><div><h1>Nara</h1><p>Sua IA pessoal · modelo compacto local</p></div></header>
    <section className="status"><span>{status}</span><button onClick={load} disabled={busy || !!engine.current}>{engine.current ? "IA carregada" : busy ? "Preparando…" : "Iniciar IA"}</button></section>
    <section className="chat">{messages.map((m, i) => <article className={m.role} key={i}><b>{m.role === "user" ? "Você" : "Nara"}</b><p>{m.content}</p></article>)}</section>
    <form onSubmit={send}><input value={input} onChange={e => setInput(e.target.value)} placeholder="Converse com a Nara…" /><button disabled={busy || !input.trim()}>Enviar</button></form>
    <small className="note">Modelo compacto para reduzir o risco de fechar o aplicativo. O primeiro uso baixa arquivos; deixe a Nara aberta e conectada ao Wi-Fi durante a preparação.</small>
  </main>;
}
createRoot(document.getElementById("root")).render(<App />);

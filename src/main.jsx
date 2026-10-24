import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { pipeline, env } from "@huggingface/transformers";
import "./style.css";

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = "./models/";
env.useBrowserCache = true;

function App() {
  const [messages, setMessages] = useState([{ role: "assistant", content: "Oi! Eu sou a Nara. Meu modelo vem incluído neste APK, então não preciso baixar o modelo ao abrir o aplicativo." }]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("Iniciando IA local…");
  const [busy, setBusy] = useState(true);
  const engine = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let cancelled = false;
    (async () => {
      try {
        setStatus("Carregando modelo incluído no APK…");
        const model = await pipeline("text-generation", "onnx-community/SmolLM2-135M-Instruct-ONNX", {
          dtype: "q4",
          device: "wasm",
          progress_callback: p => {
            if (cancelled) return;
            if (p.status === "progress" && p.progress != null) setStatus("Preparando arquivos locais: " + Math.round(p.progress) + "%");
            else if (p.status) setStatus("Inicializando IA: " + p.status);
          }
        });
        if (cancelled) return;
        engine.current = model;
        setStatus("Nara pronta · funciona sem baixar o modelo");
        setMessages(m => [...m, { role: "assistant", content: "Pronto! Meu modelo já veio instalado junto com o aplicativo. Pode conversar comigo." }]);
      } catch (err) {
        if (cancelled) return;
        setStatus("Não foi possível iniciar a IA incluída");
        setMessages(m => [...m, { role: "assistant", content: "Não consegui abrir o modelo local incluído neste APK. Não vou tentar baixar outro modelo pela internet. Detalhe técnico: " + (err?.message || String(err)) }]);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function send(e) {
    e.preventDefault();
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    const next = [...messages, { role: "user", content: q }];
    setMessages(next);
    if (!engine.current) {
      setMessages(m => [...m, { role: "assistant", content: "A IA local ainda não terminou de iniciar. Confira a mensagem de status acima." }]);
      return;
    }
    setBusy(true);
    setStatus("Nara está pensando…");
    try {
      const prompt = "Você é Nara, uma assistente pessoal que responde em português brasileiro. Seja útil e clara.\n\n" +
        next.slice(-8).map(m => (m.role === "user" ? "Usuário: " : "Nara: ") + m.content).join("\n") +
        "\nNara:";
      const result = await engine.current(prompt, { max_new_tokens: 180, do_sample: false, return_full_text: false });
      const answer = Array.isArray(result) ? result[0]?.generated_text : result?.generated_text;
      setMessages(m => [...m, { role: "assistant", content: (answer || "").trim() || "Não consegui gerar uma resposta. Tente perguntar de outro jeito." }]);
      setStatus("Nara pronta · modo local");
    } catch (err) {
      setMessages(m => [...m, { role: "assistant", content: "Erro ao gerar resposta: " + (err?.message || String(err)) }]);
      setStatus("Erro ao responder");
    } finally { setBusy(false); }
  }

  return <main>
    <header><div className="logo">N</div><div><h1>Nara</h1><p>Sua IA pessoal · modelo incluído no APK</p></div></header>
    <section className="status"><span>{status}</span><span className="status-mark">{engine.current ? "●" : "○"}</span></section>
    <section className="chat">{messages.map((m, i) => <article className={m.role} key={i}><b>{m.role === "user" ? "Você" : "Nara"}</b><p>{m.content}</p></article>)}</section>
    <form onSubmit={send}><input value={input} onChange={e => setInput(e.target.value)} placeholder={busy ? "A Nara está iniciando…" : "Converse com a Nara…"} disabled={busy || !engine.current} /><button disabled={busy || !engine.current || !input.trim()}>Enviar</button></form>
    <small className="note">O modelo está incluído no APK. A primeira inicialização pode levar um pouco; não é necessário baixar o modelo depois da instalação.</small>
  </main>;
}
createRoot(document.getElementById("root")).render(<App />);

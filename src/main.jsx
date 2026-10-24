import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const API_URL = (import.meta.env.VITE_NARA_API_URL || "").trim();
const STORAGE_KEY = "nara-chat-history-v1";

function loadMessages() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(saved) && saved.length) return saved;
  } catch {}
  return [{ role: "assistant", content: "Oi! Eu sou a Nara. Pode conversar comigo. Minhas respostas são processadas online, sem baixar um modelo de IA no seu celular." }];
}

function App() {
  const [messages, setMessages] = useState(loadMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Pronta para conversar");
  const [error, setError] = useState("");

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-100))); } catch {}
  }, [messages]);

  async function send(e) {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;

    if (!API_URL) {
      setError("A conexão com o serviço de IA ainda não foi configurada. O aplicativo não vai baixar nenhum modelo. É preciso conectar um servidor de IA para começar a responder.");
      setStatus("Serviço de IA não conectado");
      return;
    }

    setInput("");
    setError("");
    const next = [...messages, { role: "user", content: question }];
    setMessages(next);
    setBusy(true);
    setStatus("Nara está pensando…");

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.slice(-20).map(({ role, content }) => ({ role, content })),
          message: question
        })
      });
      if (!response.ok) throw new Error("O serviço respondeu com erro " + response.status + ".");
      const data = await response.json();
      const answer = data.reply ?? data.response ?? data.message?.content ?? data.choices?.[0]?.message?.content;
      if (typeof answer !== "string" || !answer.trim()) throw new Error("O serviço não retornou uma resposta válida.");
      setMessages(current => [...current, { role: "assistant", content: answer.trim() }]);
      setStatus("Pronta para conversar");
    } catch (err) {
      setMessages(current => [...current, { role: "assistant", content: "Não consegui conectar ao serviço de IA agora. Confira sua conexão e tente novamente." }]);
      setStatus("Falha na conexão");
      setError(err?.message || "Erro de conexão.");
    } finally {
      setBusy(false);
    }
  }

  return <main>
    <header><div className="logo">N</div><div><h1>Nara</h1><p>Sua assistente de IA</p></div></header>
    <section className="status"><span>{status}</span><span className="status-mark">{busy ? "…" : "●"}</span></section>
    <section className="chat">{messages.map((m, i) => <article className={m.role} key={i}><b>{m.role === "user" ? "Você" : "Nara"}</b><p>{m.content}</p></article>)}</section>
    {error && <p className="error" role="status">{error}</p>}
    <form onSubmit={send}><input value={input} onChange={e => setInput(e.target.value)} placeholder="Converse com a Nara…" disabled={busy} /><button disabled={busy || !input.trim()}>{busy ? "Enviando…" : "Enviar"}</button></form>
    <small className="note">Sem download de modelos no celular. As respostas precisam de conexão com a internet e de um serviço de IA configurado.</small>
  </main>;
}

createRoot(document.getElementById("root")).render(<App />);

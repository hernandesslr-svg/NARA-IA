import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const API_URL = (import.meta.env.VITE_NARA_API_URL || "").trim();
const STORAGE_KEY = "nara-chat-history-v1";

function loadMessages() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(saved) && saved.length) return saved;
  } catch {}
  return [{ role: "assistant", content: "Oi! Sou a Nara. Estou aqui para conversar com você." }];
}

function App() {
  const [messages, setMessages] = useState(loadMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-100))); } catch {}
  }, [messages]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, busy]);

  async function send(e) {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    const next = [...messages, { role: "user", content: question }];
    setMessages(next);

    if (!API_URL) {
      setMessages(current => [...current, {
        role: "assistant",
        content: "Ainda não consigo responder porque o serviço de IA não foi conectado. Não é um problema do seu celular e eu não vou baixar nenhum modelo. Preciso que a conexão com o servidor seja configurada."
      }]);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-20).map(({role, content}) => ({role, content})), message: question })
      });
      if (!response.ok) throw new Error("Serviço indisponível (" + response.status + ")");
      const data = await response.json();
      const answer = data.reply ?? data.response ?? data.message?.content ?? data.choices?.[0]?.message?.content;
      if (typeof answer !== "string" || !answer.trim()) throw new Error("Resposta inválida do serviço");
      setMessages(current => [...current, { role: "assistant", content: answer.trim() }]);
    } catch {
      setMessages(current => [...current, { role: "assistant", content: "Não consegui alcançar o serviço de IA agora. Verifique sua conexão e tente novamente." }]);
    } finally {
      setBusy(false);
    }
  }

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand-mark">N</div>
      <div className="brand-copy"><h1>Nara</h1><p>Sua assistente pessoal</p></div>
      <span className="online-dot" aria-label="Aplicativo aberto" />
    </header>
    <section className="chat-list" ref={listRef} aria-live="polite">
      <div className="day-label">CONVERSA</div>
      {messages.map((m, i) => <article className={"message " + (m.role === "user" ? "from-user" : "from-nara")} key={i}>
        {m.role !== "user" && <div className="avatar-small">N</div>}
        <div className="bubble"><p>{m.content}</p></div>
      </article>)}
      {busy && <article className="message from-nara"><div className="avatar-small">N</div><div className="bubble typing"><i/><i/><i/></div></article>}
    </section>
    <form className="composer" onSubmit={send}>
      <input value={input} onChange={e => setInput(e.target.value)} placeholder="Mensagem para a Nara" aria-label="Mensagem para a Nara" disabled={busy}/>
      <button aria-label="Enviar mensagem" title="Enviar mensagem" disabled={busy || !input.trim()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-5 16-3-6-8-2Z"/><path d="M12 14 20 4"/></svg></button>
    </form>
    <p className="footer-note">As conversas ficam neste aparelho. A IA online precisa ser conectada para responder.</p>
  </main>;
}

createRoot(document.getElementById("root")).render(<App />);

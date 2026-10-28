import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { pipeline, env } from "@huggingface/transformers";
import "./style.css";
import { TRAINED_CORE, buildSystemPrompt } from "./nara-core";

// Modelo ONNX empacotado no APK: sem URL de API, chave ou servidor externo.
const MODEL_ID = "onnx-community/SmolLM2-135M-Instruct-ONNX";
let localGeneratorPromise;
env.localModelPath = "/models/";
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.backends.onnx.wasm.wasmPaths = "/onnx-runtime/";
// Android WebView nem sempre oferece isolamento para WASM multithread.
// Uma thread evita travamentos causados por SharedArrayBuffer/workers.
env.backends.onnx.wasm.numThreads = 1;

function getLocalGenerator() {
  if (!localGeneratorPromise) {
    localGeneratorPromise = pipeline("text-generation", MODEL_ID, { dtype: "q4" })
      .catch(error => { localGeneratorPromise = null; throw error; });
  }
  return localGeneratorPromise;
}

const icon = {
  menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  close: <><path d="m6 6 12 12M18 6 6 18"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.7-1.4-2.4L7.1 15a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.8 1l1.7-.7 1.4 2.4-1.4 1.1a8 8 0 0 1-.1 2Z"/></>,
  more: <><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 1.5-3.3 1.7 1.7 0 0 1 1.3-2.8H18a3 3 0 0 0 3-3c0-5-4-8.9-9-8.9Z"/><circle cx="7.5" cy="10" r=".8"/><circle cx="10" cy="6.8" r=".8"/><circle cx="15" cy="7.5" r=".8"/></>,
  globe: <><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
  info: <><circle cx="12" cy="12" r="10"/><path d="M12 11v5M12 8h.01"/></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></>
};
function Icon({name, size=22}) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon[name] || icon.info}</svg>; }

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState("chat");
  const [drawer, setDrawer] = useState(false);
  const [libraryTab, setLibraryTab] = useState("Todas");
  const [theme, setTheme] = useState("Escuro");
  const [accent, setAccent] = useState("#8b20ff");
  const [language, setLanguage] = useState("Português (BR)");
  const [notifications, setNotifications] = useState(true);
  const [memory, setMemory] = useState(true);
  const [privacy, setPrivacy] = useState(true);
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, busy]);

  function normalizeCoreText(value) {
    return String(value || "").toLocaleLowerCase("pt-BR")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  }

  function findCoreAnswer(question) {
    const normalized = normalizeCoreText(question);
    if (!normalized) return null;
    const lessons = (TRAINED_CORE?.lessons || []).filter(item => item && typeof item.user === "string" && typeof item.assistant === "string");
    const exact = lessons.find(item => normalizeCoreText(item.user) === normalized);
    if (exact?.assistant?.trim()) return exact.assistant.trim();

    const queryWords = [...new Set(normalized.split(" ").filter(word => word.length > 2))];
    if (queryWords.length < 3) return null;
    let best = null;
    let bestScore = 0;
    for (const lesson of lessons) {
      const candidate = normalizeCoreText(lesson.user);
      if (!candidate) continue;
      const words = new Set(candidate.split(" ").filter(word => word.length > 2));
      let hits = 0;
      for (const word of queryWords) if (words.has(word)) hits++;
      const score = hits / Math.max(queryWords.length, words.size);
      if (score > bestScore) { bestScore = score; best = lesson; }
    }
    return best && bestScore >= 0.78 && best.assistant?.trim() ? best.assistant.trim() : null;
  }

  async function searchInternet(query) {
    const q = String(query || "").trim();
    if (!q) return "";
    const encoded = encodeURIComponent(q);
    const failures = [];

    // 1) Google via leitor público. Descarta explicitamente páginas de CAPTCHA.
    for (const url of [
      "https://r.jina.ai/http://www.google.com/search?q=" + encoded + "&num=8",
      "https://r.jina.ai/https://www.google.com/search?q=" + encoded + "&num=8"
    ]) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(url, { signal: controller.signal, headers: { Accept: "text/plain" } });
        if (!response.ok) throw new Error("HTTP " + response.status);
        const body = (await response.text()).slice(0, 16000).trim();
        if (body.length < 120 || /unusual traffic|detected unusual traffic|requiring captcha|captcha|not a robot|systems have detected/i.test(body)) {
          throw new Error("Google retornou bloqueio/CAPTCHA ou conteúdo inválido");
        }
        return "RESULTADOS DA WEB (Google) PARA: " + q + "\n" + body +
          "\n\nResponda diretamente com base nos resultados e preserve URLs úteis.";
      } catch (e) {
        failures.push(String(e?.message || e));
      } finally {
        clearTimeout(timer);
      }
    }

    // 2) Pesquisa aberta da Wikipédia, acessível por CORS sem chave.
    try {
      const response = await fetch("https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=" + encoded + "&format=json&origin=*&srlimit=6", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Wikipedia HTTP " + response.status);
      const data = await response.json();
      const hits = (data?.query?.search || []).filter(x => x && x.title && x.snippet);
      if (hits.length) {
        const items = hits.map(x => "- " + x.title + ": " + x.snippet.replace(/<[^>]+>/g, "") + " (https://pt.wikipedia.org/wiki/" + encodeURIComponent(x.title.replace(/ /g, "_")) + ")").join("\n");
        return "RESULTADOS DE PESQUISA NA WEB PARA: " + q + "\n" + items +
          "\n\nResponda à pergunta usando estes resultados; se precisar de mais detalhes, abra as fontes e não invente fatos.";
      }
    } catch (e) {
      failures.push(String(e?.message || e));
    }

    // 3) Não entrega páginas de bloqueio como se fossem respostas.
    throw new Error("As fontes públicas não responderam nesta tentativa. " + failures.join(" | "));
  }

  function simpleAnswer(question) {
    let q = String(question || "").trim().toLocaleLowerCase("pt-BR")
      .replace(/^quanto\\s+(?:é|e)\\s+/i, "")
      .replace(/[?!.]+$/g, "").replace(/,/g, ".");
    q = q.replace(/\\bmais\\b/g, "+").replace(/\\bmenos\\b/g, "-")
      .replace(/\\bvezes\\b/g, "*").replace(/\\b(?:dividido por|dividido)\\b/g, "/")
      .replace(/\\bpor\\b/g, "*").replace(/\\s+/g, "");
    const match = q.match(/^(-?\\d+(?:\\.\\d+)?)([+*/]|x|×|-)(-?\\d+(?:\\.\\d+)?)$/i);
    if (!match) return null;
    const a = Number(match[1]), op = match[2].toLowerCase(), b = Number(match[3]);
    if (op === "+") return String(a + b);
    if (op === "-") return String(a - b);
    if (op === "*" || op === "x" || op === "×") return String(a * b);
    if (b === 0) return "Não é possível dividir por zero.";
    return String(a / b);
  }

  function needsInternetResearch(question) {
    return /(internet|google|pesquis|busque|procure|not[ií]cia|atual|hoje|agora|atualmente|pol[ií]tica|presidente|governo|elei[cç][aã]o|cot[aã][cç][aã]o|pre[cç]o|quanto custa|quem [eé]|quando foi|fonte|link|site|202[5-9]|203\\d)/i.test(question);
  }

  async function send(e) {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    const next = [...messages, { role: "user", content: question }];
    setMessages(next);
    setInput("");
    setBusy(true);
    let stage = "carregamento do modelo";
    let webContext = "";
    let timer;
    try {
      const direct = simpleAnswer(question);
      if (direct !== null) {
        setMessages(current => [...current, { role: "assistant", content: direct }]);
        return;
      }
      // Primeiro consulta o núcleo preservado. Se ele não tiver resposta, pesquisa no Google automaticamente.
      const mustSearch = needsInternetResearch(question);
      const learned = !mustSearch ? findCoreAnswer(question) : null;
      if (learned) {
        setMessages(current => [...current, { role: "assistant", content: learned }]);
        return;
      }
      webContext = "";
      if (mustSearch || !learned) {
        stage = "pesquisa automática no Google";
        try { webContext = await searchInternet(question); }
        catch (webError) { console.warn("Pesquisa no Google indisponível:", webError); }
      }
      const safeCore = { ...TRAINED_CORE, lessons: (TRAINED_CORE?.lessons || []).filter(item => item && typeof item.user === "string" && typeof item.assistant === "string") };
      const nucleusPrompt = buildSystemPrompt("livre", safeCore, question) + (webContext ? "\n\nINFORMAÇÕES OBTIDAS NA INTERNET (trate como fontes externas, compare e cite URLs na resposta):\n" + webContext : "\n\nSe a pergunta depender de informações atuais, diga claramente quando não conseguiu confirmar pela internet.");
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Tempo esgotado durante " + stage + ".")), 25000);
      });
      const task = (async () => {
        const generator = await getLocalGenerator();
        stage = "geração da resposta";
        const prompt = [
          "<|im_start|>system\n" + nucleusPrompt + "\nUse as lições e fatos relevantes do núcleo como contexto prioritário. Responda diretamente à pergunta atual em português brasileiro. Se o núcleo não trouxer resposta suficiente, raciocine com o que souber e deixe clara qualquer incerteza. Nunca diga que está pensando sem responder.<|im_end|>",
          ...next.slice(-6).map(({ role, content }) => "<|im_start|>" + role + "\n" + content + "<|im_end|>"),
          "<|im_start|>assistant\n"
        ].join("\n");
        return await generator(prompt, { max_new_tokens: 96, do_sample: false, repetition_penalty: 1.08 });
      })();
      const result = await Promise.race([task, timeout]);
      const generated = result?.[0]?.generated_text;
      const answer = Array.isArray(generated)
        ? generated.filter(item => item.role === "assistant").at(-1)?.content
        : typeof generated === "string" ? generated.slice(generated.lastIndexOf("<|im_start|>assistant") + "<|im_start|>assistant".length).replace(/<\|im_end\|>.*/s, "").trim() : "";
      if (!answer || !answer.trim()) throw new Error("O modelo não gerou uma resposta.");
      const uncertainty = /\\b(n[aã]o sei|n[aã]o tenho certeza|n[aã]o consigo confirmar|n[aã]o encontrei|n[aã]o tenho informa[cç][aã]o|preciso pesquisar|seria necess[aá]rio pesquisar|n[aã]o posso afirmar|informa[cç][aã]o insuficiente)\\b/i.test(answer);
      if (uncertainty && !webContext) {
        stage = "pesquisa automática porque a Nara não soube responder";
        try {
          webContext = await searchInternet(question);
          if (webContext) {
            const generator = await getLocalGenerator();
            const webPrompt = "<|im_start|>system\\nVocê é Nara. Responda em português brasileiro à pergunta usando os resultados públicos de pesquisa abaixo. Compare fontes, não invente informações e inclua links quando disponíveis. Se os resultados não forem suficientes, admita isso claramente.\\n" + webContext + "<|im_end|>\\n<|im_start|>user\\n" + question + "<|im_end|>\\n<|im_start|>assistant\\n";
            const webResult = await generator(webPrompt, { max_new_tokens: 120, do_sample: false, repetition_penalty: 1.08 });
            const raw = webResult?.[0]?.generated_text;
            const researched = typeof raw === "string" ? raw.slice(raw.lastIndexOf("<|im_start|>assistant") + "<|im_start|>assistant".length).replace(/<\\|im_end\\|>.*/s, "").trim() : "";
            if (researched) {
              setMessages(current => [...current, { role: "assistant", content: researched }]);
              return;
            }
          }
        } catch (researchError) {
          console.warn("Pesquisa automática após incerteza falhou:", researchError);
        }
      }
      setMessages(current => [...current, { role: "assistant", content: answer.trim() }]);
    } catch (error) {
      console.error("Falha na IA local da Nara:", error);
      let fallback = "";
      try {
        stage = "pesquisa automática no Google";
        if (!webContext) webContext = await searchInternet(question);
        if (webContext) {
          try {
            const generator = await getLocalGenerator();
            const prompt = "<|im_start|>system\\nVocê é Nara. Responda diretamente em português brasileiro usando os resultados do Google abaixo. Extraia a resposta concreta, cite URLs quando disponíveis e não diga apenas que não sabe.\\n" + webContext + "<|im_end|>\\n<|im_start|>user\\n" + question + "<|im_end|>\\n<|im_start|>assistant\\n";
            const result = await generator(prompt, { max_new_tokens: 140, do_sample: false });
            const generated = result?.[0]?.generated_text;
            fallback = typeof generated === "string" ? generated.slice(generated.lastIndexOf("<|im_start|>assistant") + "<|im_start|>assistant".length).replace(/<\\|im_end\\|>.*/s, "").trim() : "";
          } catch (modelError) {
            // O resultado pesquisado continua útil mesmo quando o modelo local falha.
            fallback = webContext;
          }
        }
      } catch (fallbackError) {
        console.warn("Pesquisa automática no Google falhou:", fallbackError);
      }
      setMessages(current => [...current, {
        role: "assistant",
        content: fallback || "Não consegui completar a resposta localmente. Vou precisar de acesso à pesquisa pública do Google para trazer a resposta."
      }]);
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }

  function newChat() { setMessages([]); setInput(""); setPanel("chat"); setDrawer(false); }
  function openPanel(next) { setPanel(next); setDrawer(false); }
  const settings = [
    { title: "Geral", subtitle: "Preferências básicas", icon: "settings", action: "general" },
    { title: "Notificações", subtitle: "Alertas e lembretes", icon: "bell", action: "notifications" },
    { title: "Personalização", subtitle: "Tema e cor principal", icon: "palette", action: "personalization" },
    { title: "Idioma", subtitle: language, icon: "globe", action: "language" },
    { title: "Privacidade", subtitle: "Seus dados e segurança", icon: "shield", action: "privacy" },
    { title: "Sobre", subtitle: "Informações da Nara", icon: "info", action: "about" }
  ];

  return <main className={`app-shell ${theme === "Claro" ? "light-theme" : ""}`} style={{"--accent": accent}}>
    <header className="topbar">
      <button className="icon-button menu-button" onClick={() => setDrawer(true)} aria-label="Abrir menu"><Icon name="menu"/></button>
      <h1>Nara</h1>
      <button className="icon-button more-button" onClick={() => openPanel("settings")} aria-label="Mais opções"><Icon name="more"/></button>
    </header>

    {panel === "chat" && <>
      <section className="chat-list" ref={listRef} aria-live="polite">
        {messages.map((m, i) => <article className={"message " + (m.role === "user" ? "from-user" : "from-nara")} key={i}>
          <div className="bubble"><p>{m.content}</p></div>
        </article>)}
        {busy && <article className="message from-nara"><div className="bubble typing"><i/><i/><i/></div></article>}
      </section>
      <form className="composer" onSubmit={send}>
        <button type="button" className="icon-button plus-button" onClick={() => openPanel("library")} aria-label="Abrir biblioteca"><Icon name="plus"/></button>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Digite sua mensagem..." aria-label="Mensagem para a Nara" disabled={busy}/>
        <button type="submit" className="send-button" aria-label="Enviar mensagem" disabled={busy || !input.trim()}><Icon name="send" size={21}/></button>
      </form>
    </>}

    {panel === "library" && <section className="page-panel">
      <div className="page-heading"><button className="back-button" onClick={() => openPanel("chat")}>‹</button><h2>Biblioteca</h2></div>
      <div className="tab-row">{["Todas","Imagens","Vídeos","Documentos"].map(t => <button key={t} className={libraryTab===t?"tab active":"tab"} onClick={() => setLibraryTab(t)}>{t}</button>)}</div>
      <div className="empty-state"><div className="empty-icon"><Icon name={libraryTab==="Documentos"?"file":"book"} size={34}/></div><h3>Sua biblioteca está vazia</h3><p>Os arquivos que você adicionar aparecerão aqui.</p></div>
    </section>}

    {panel === "settings" && <section className="page-panel">
      <div className="page-heading"><button className="back-button" onClick={() => openPanel("chat")}>‹</button><h2>Configurações</h2></div>
      <div className="settings-list">{settings.map(s => <button className="setting-row" key={s.action} onClick={() => openPanel(s.action)}><span className="setting-icon"><Icon name={s.icon}/></span><span className="setting-copy"><strong>{s.title}</strong><small>{s.subtitle}</small></span><span className="chevron">›</span></button>)}</div>
    </section>}

    {panel === "general" && <SubPage title="Geral" back={() => openPanel("settings")}><div className="setting-detail"><strong>Memória da conversa</strong><p>Manter o contexto durante esta conversa.</p><Toggle checked={memory} onChange={setMemory}/></div><div className="setting-detail"><strong>Privacidade local</strong><p>Não salvar conversas automaticamente neste aparelho.</p><Toggle checked={privacy} onChange={setPrivacy}/></div></SubPage>}
    {panel === "notifications" && <SubPage title="Notificações" back={() => openPanel("settings")}><div className="setting-detail"><strong>Notificações gerais</strong><p>Permitir alertas do aplicativo.</p><Toggle checked={notifications} onChange={setNotifications}/></div></SubPage>}
    {panel === "personalization" && <SubPage title="Personalização" back={() => openPanel("settings")}><h3 className="section-label">Tema</h3><div className="theme-options">{["Escuro","Claro","Automático"].map(t=><button className={theme===t?"theme-option selected":"theme-option"} key={t} onClick={()=>setTheme(t)}>{t}</button>)}</div><h3 className="section-label">Cor principal</h3><div className="color-options">{["#8b20ff","#2678ff","#ed3e91","#f04444","#f28b20","#19b66a"].map(c=><button key={c} aria-label={"Cor "+c} className={accent===c?"color-swatch selected":"color-swatch"} style={{background:c}} onClick={()=>setAccent(c)}/>)}</div></SubPage>}
    {panel === "language" && <SubPage title="Idioma" back={() => openPanel("settings")}><div className="setting-detail"><label htmlFor="language">Idioma do aplicativo</label><select id="language" value={language} onChange={e=>setLanguage(e.target.value)}><option>Português (BR)</option><option>English</option><option>Español</option></select></div></SubPage>}
    {panel === "privacy" && <SubPage title="Privacidade" back={() => openPanel("settings")}><div className="setting-detail"><strong>Conversas não são salvas entre sessões</strong><p>Esta versão mantém as mensagens apenas enquanto o chat está aberto.</p></div></SubPage>}
    {panel === "about" && <SubPage title="Sobre a Nara" back={() => openPanel("settings")}><div className="about-card"><h3>Nara</h3><p>Sua assistente pessoal.</p><small>Aplicativo Android</small></div></SubPage>}

    {drawer && <div className="drawer-backdrop" onClick={() => setDrawer(false)}><nav className="drawer" onClick={e=>e.stopPropagation()}><div className="drawer-header"><span>Nara</span><button className="icon-button" onClick={()=>setDrawer(false)} aria-label="Fechar menu"><Icon name="close"/></button></div><button className="drawer-item" onClick={newChat}><Icon name="plus"/>Nova conversa</button><button className="drawer-item" onClick={()=>openPanel("library")}><Icon name="image"/>Biblioteca</button><button className="drawer-item" onClick={()=>openPanel("settings")}><Icon name="settings"/>Configurações</button></nav></div>}
  </main>;
}
function Toggle({checked,onChange}) { return <button type="button" className={"toggle "+(checked?"on":"")} role="switch" aria-checked={checked} onClick={()=>onChange(!checked)}><span/></button>; }
function SubPage({title,back,children}) { return <section className="page-panel"><div className="page-heading"><button className="back-button" onClick={back}>‹</button><h2>{title}</h2></div><div className="subpage-content">{children}</div></section>; }

createRoot(document.getElementById("root")).render(<App />);
